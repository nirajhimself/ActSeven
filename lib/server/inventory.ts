import "server-only";
import type postgres from "postgres";
import { db } from "./db";
import { prisma } from "./prisma";

/**
 * Stock per variant (product × colour × size), in the inventory table.
 *
 * Reservation runs inside the order's SQL transaction (lib/server/orders.ts)
 * with row locks, so these helpers use the same postgres.js connection; admin
 * edits go through Prisma. A variant without an inventory row has no stock.
 */

type Tx = postgres.TransactionSql<Record<string, never>>;
export type StockLine = { variantId: number; quantity: number; slug: string; colour: string; size: string };
/** Unpaid online orders release their stock after this long. */
export const PENDING_ORDER_TTL_MINUTES = 30;

export class OutOfStockError extends Error {
  constructor(
    public readonly slug: string,
    public readonly colour: string,
    public readonly size: string,
    public readonly available: number,
  ) {
    super(`Insufficient stock for ${slug} / ${colour} / ${size}`);
  }
}

/**
 * Takes stock for an order inside its transaction. Rows are locked (FOR UPDATE)
 * so concurrent checkouts can't both take the last unit.
 */
export async function reserveStock(tx: Tx, lines: StockLine[]) {
  // Lock in a stable order to avoid deadlocks between concurrent orders.
  const sorted = [...lines].sort((a, b) => a.variantId - b.variantId);
  for (const line of sorted) {
    const [row] = await tx`select quantity from inventory where variant_id = ${line.variantId} for update`;
    const available = (row?.quantity as number | undefined) ?? 0;
    if (available < line.quantity) throw new OutOfStockError(line.slug, line.colour, line.size, available);
    await tx`update inventory set quantity = quantity - ${line.quantity}, updated_at = now() where variant_id = ${line.variantId}`;
  }
}

/** Returns an order's stock exactly once (guarded by orders.stock_reserved). */
export async function restoreStock(tx: Tx, orderId: string) {
  const released = await tx`update orders set stock_reserved = false where id = ${orderId} and stock_reserved returning id`;
  if (released.length === 0) return false;
  const items = await tx`select variant_id, quantity from order_items where order_id = ${orderId} and variant_id is not null`;
  for (const i of items) {
    await tx`update inventory set quantity = quantity + ${i.quantity}, updated_at = now() where variant_id = ${i.variant_id}`;
  }
  return true;
}

/**
 * Re-takes stock for an order whose reservation was released (e.g. a payment
 * that arrived after the order expired). Money has been taken, so this never
 * fails — stock is floored at zero and the admin can reconcile.
 */
export async function reclaimStock(tx: Tx, orderId: string) {
  const claimed = await tx`update orders set stock_reserved = true where id = ${orderId} and not stock_reserved returning id`;
  if (claimed.length === 0) return;
  const items = await tx`select variant_id, quantity from order_items where order_id = ${orderId} and variant_id is not null`;
  for (const i of items) {
    await tx`update inventory set quantity = greatest(quantity - ${i.quantity}, 0), updated_at = now() where variant_id = ${i.variant_id}`;
  }
}

/** Expires abandoned online orders and returns their stock. Safe to call often. */
export async function expireStalePendingOrders() {
  const sql = db();
  const stale = await sql`
    select id from orders
     where status in ('pending_payment', 'payment_failed')
       and created_at < now() - ${`${PENDING_ORDER_TTL_MINUTES} minutes`}::interval
     limit 200`;
  let expired = 0;
  for (const { id } of stale) {
    await sql.begin(async (tx) => {
      const rows = await tx`
        update orders set status = 'expired', updated_at = now()
         where id = ${id} and status in ('pending_payment', 'payment_failed')
        returning id`;
      if (rows.length) {
        await restoreStock(tx, id);
        await tx`update payments set status = 'cancelled', updated_at = now() where order_id = ${id} and status in ('created', 'pending', 'failed')`;
        expired++;
      }
    });
  }
  return expired;
}

/** Admin: set stock for many variants at once. Returns how many were saved. */
export async function setStockLevels(levels: { variantId: number; quantity: number }[]) {
  const valid = levels.filter((l) => Number.isInteger(l.variantId) && Number.isInteger(l.quantity) && l.quantity >= 0 && l.quantity <= 100000);
  if (valid.length === 0) return 0;
  const db = prisma();
  const existing = new Set(
    (await db.variant.findMany({ where: { id: { in: valid.map((l) => l.variantId) } }, select: { id: true } })).map((v) => v.id),
  );
  const rows = valid.filter((l) => existing.has(l.variantId));
  await db.$transaction(
    rows.map((l) =>
      db.inventory.upsert({
        where: { variantId: l.variantId },
        create: { variantId: l.variantId, quantity: l.quantity },
        update: { quantity: l.quantity, updatedAt: new Date() },
      }),
    ),
  );
  return rows.length;
}
