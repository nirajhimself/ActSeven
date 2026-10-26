import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { PaymentMethod } from "@/lib/pricing";
import { db } from "./db";
import { reclaimStock, reserveStock, restoreStock } from "./inventory";

export type OrderStatus = "pending_payment" | "paid" | "cod_confirmed" | "payment_failed" | "shipped" | "delivered" | "cancelled" | "expired";

export const ORDER_STATUSES: OrderStatus[] = ["pending_payment", "paid", "cod_confirmed", "payment_failed", "shipped", "delivered", "cancelled", "expired"];

export type OrderItemInput = {
  variantId: number;
  /** SKU at the time of purchase, kept on the order line as a snapshot. */
  sku: string;
  slug: string;
  name: string;
  colour: string;
  size: string;
  unitPrice: number;
  quantity: number;
};

export type CustomerInput = {
  email: string;
  phone: string;
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  giftNote: string;
};

export type Order = {
  id: string;
  number: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  email: string;
  phone: string;
  name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  pincode: string;
  giftNote: string | null;
  subtotal: number;
  shipping: number;
  codFee: number;
  total: number;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  items: { id: string; productSlug: string; productName: string; colour: string; size: string; unitPrice: number; quantity: number }[];
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Human-friendly order number, e.g. A7-261022-K4QZ: the date in India (IST),
 * then 4 characters with no ambiguous letters or digits.
 */
export function orderNumber(now: Date) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const suffix = [...randomBytes(4)].map((b) => alphabet[b % alphabet.length]).join("");
  const ymd = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(2, 10).replace(/-/g, "");
  return `A7-${ymd}-${suffix}`;
}

const isUniqueViolation = (err: unknown, constraint: string) =>
  (err as { code?: string; constraint_name?: string })?.code === "23505" && (err as { constraint_name?: string }).constraint_name === constraint;

/** Thrown when an order with the same checkout token already exists (a retried submission). */
export class DuplicateCheckoutError extends Error {}

/** Orders one client address may place per hour (generous: mobile networks share addresses). */
export const MAX_ORDERS_PER_IP_PER_HOUR = 10;
/** Cash-on-delivery orders one phone number or email may have open (placed, not yet shipped or cancelled). */
export const MAX_OPEN_COD_ORDERS = 2;

/** Thrown when a new order would exceed one of the limits above (stops scripted fake orders holding stock). */
export class OrderLimitError extends Error {
  constructor(public readonly reason: "ip" | "cod") {
    super(`Order limit reached (${reason})`);
  }
}

export async function createOrder(input: {
  customer: CustomerInput;
  items: OrderItemInput[];
  method: PaymentMethod;
  totals: { subtotal: number; shipping: number; codFee: number; total: number };
  customerId?: string | null;
  /** One per checkout attempt; a second order with the same token is refused. */
  checkoutToken?: string | null;
  /** The shopper's address, for the per-address limit ("unknown" or absent skips it). */
  clientIp?: string | null;
}): Promise<{ id: string; number: string; status: OrderStatus }> {
  // A clash on the random part of the order number is very unlikely; retry a few times if it happens.
  for (let attempt = 1; ; attempt++) {
    try {
      return await insertOrder(input, orderNumber(new Date()));
    } catch (err) {
      if (isUniqueViolation(err, "orders_checkout_token_key")) throw new DuplicateCheckoutError("Order already placed for this checkout");
      if (!isUniqueViolation(err, "orders_number_key") || attempt >= 4) throw err;
    }
  }
}

async function insertOrder(input: Parameters<typeof createOrder>[0], number: string) {
  const sql = db();
  const id = randomUUID();
  const status: OrderStatus = input.method === "cod" ? "cod_confirmed" : "pending_payment";
  const c = input.customer;
  const ip = input.clientIp && input.clientIp !== "unknown" ? input.clientIp.slice(0, 64) : null;

  await sql.begin(async (tx) => {
    // Limits are checked under advisory locks (address first, then phone, so
    // two checkouts never wait on each other in opposite order), so a burst
    // of parallel submissions can't all pass the count.
    if (ip) {
      await tx`select pg_advisory_xact_lock(hashtext(${`order_ip:${ip}`}))`;
      const [{ recent }] = await tx`
        select count(*)::int as recent from orders where client_ip = ${ip} and created_at > now() - interval '1 hour'`;
      if (recent >= MAX_ORDERS_PER_IP_PER_HOUR) throw new OrderLimitError("ip");
    }
    if (input.method === "cod") {
      await tx`select pg_advisory_xact_lock(hashtext(${`order_cod:${c.phone}`}))`;
      const [{ open }] = await tx`
        select count(*)::int as open from orders
         where status = 'cod_confirmed' and (phone = ${c.phone} or email = ${c.email})`;
      if (open >= MAX_OPEN_COD_ORDERS) throw new OrderLimitError("cod");
    }
    await tx`
      insert into orders (id, number, status, payment_method, email, phone, name, address1, address2, city, state, pincode,
                          gift_note, subtotal, shipping, cod_fee, total, customer_id, stock_reserved, checkout_token, client_ip)
      values (${id}, ${number}, ${status}, ${input.method}, ${c.email}, ${c.phone}, ${c.name}, ${c.address1},
              ${c.address2 || null}, ${c.city}, ${c.state}, ${c.pincode}, ${c.giftNote || null},
              ${input.totals.subtotal}, ${input.totals.shipping}, ${input.totals.codFee}, ${input.totals.total},
              ${input.customerId ?? null}, true, ${input.checkoutToken ?? null}, ${ip})`;
    // Throws OutOfStockError (rolling back the whole order) if a variant ran out.
    await reserveStock(
      tx,
      input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, slug: i.slug, colour: i.colour, size: i.size })),
    );
    await tx`
      insert into order_items ${tx(
        input.items.map((i) => ({
          order_id: id,
          variant_id: i.variantId,
          sku: i.sku,
          product_slug: i.slug,
          product_name: i.name,
          colour: i.colour,
          size: i.size,
          unit_price: i.unitPrice,
          quantity: i.quantity,
        })),
      )}`;
    // COD is collected on delivery; online payments start as "created".
    await tx`
      insert into payments (id, order_id, provider, status, amount)
      values (${randomUUID()}, ${id}, ${input.method}, ${input.method === "cod" ? "pending" : "created"}, ${input.totals.total})`;
  });

  return { id, number, status };
}

/** The order already created by a checkout attempt, if any (for idempotent retries). */
export async function findOrderByCheckoutToken(token: string) {
  const [row] = await db()`
    select id, status, payment_method, total, razorpay_order_id, name, email, phone
      from orders where checkout_token = ${token}`;
  return row
    ? {
        id: row.id as string,
        status: row.status as OrderStatus,
        paymentMethod: row.payment_method as PaymentMethod,
        total: row.total as number,
        razorpayOrderId: row.razorpay_order_id as string | null,
        name: row.name as string,
        email: row.email as string,
        phone: row.phone as string,
      }
    : null;
}

export async function attachRazorpayOrder(orderId: string, razorpayOrderId: string) {
  const sql = db();
  await sql`update orders set razorpay_order_id = ${razorpayOrderId}, updated_at = now() where id = ${orderId}`;
  await sql`update payments set provider_order_id = ${razorpayOrderId}, updated_at = now() where order_id = ${orderId} and provider = 'razorpay'`;
}

/**
 * Marks an online order paid. Returns the order id, or null if nothing matched.
 * Idempotent for already-paid orders. A payment that lands after the order
 * expired is still honoured (money was taken) and its stock is re-taken.
 */
export async function markOrderPaid(match: { orderId?: string; razorpayOrderId: string }, paymentId: string) {
  return db().begin(async (tx) => {
    const rows = await tx`
      update orders
         set status = 'paid', razorpay_payment_id = ${paymentId}, updated_at = now()
       where razorpay_order_id = ${match.razorpayOrderId}
         ${match.orderId ? tx`and id = ${match.orderId}` : tx``}
         and status in ('pending_payment', 'payment_failed', 'expired', 'paid')
      returning id`;
    const id = (rows[0]?.id as string | undefined) ?? null;
    if (id) {
      await reclaimStock(tx, id);
      await tx`
        update payments set status = 'captured', provider_payment_id = ${paymentId}, updated_at = now()
         where order_id = ${id} and provider = 'razorpay' and (provider_payment_id is null or provider_payment_id = ${paymentId})`;
    }
    return id;
  });
}

/** Releases an unpaid online order straight away (e.g. the payment gateway was unreachable). */
export async function releaseUnpaidOrder(id: string) {
  await db().begin(async (tx) => {
    const rows = await tx`
      update orders set status = 'expired', updated_at = now()
       where id = ${id} and status = 'pending_payment' and razorpay_payment_id is null
      returning id`;
    if (rows.length) {
      await restoreStock(tx, id);
      await tx`update payments set status = 'cancelled', updated_at = now() where order_id = ${id} and status in ('created', 'pending')`;
    }
  });
}

export async function markPaymentFailed(razorpayOrderId: string) {
  const sql = db();
  const rows = await sql`
    update orders set status = 'payment_failed', updated_at = now()
     where razorpay_order_id = ${razorpayOrderId} and status = 'pending_payment'
    returning id`;
  if (rows.length) {
    await sql`update payments set status = 'failed', updated_at = now() where order_id = ${rows[0].id} and status = 'created'`;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOrder(id: string): Promise<Order | null> {
  if (!UUID.test(id)) return null;
  const sql = db();
  // In parallel: each round trip to a distant database costs hundreds of ms.
  const [[row], items] = await Promise.all([
    sql`select * from orders where id = ${id}`,
    sql`select id::text as id, product_slug, product_name, colour, size, unit_price, quantity
          from order_items where order_id = ${id} order by id`,
  ]);
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    paymentMethod: row.payment_method,
    email: row.email,
    phone: row.phone,
    name: row.name,
    address1: row.address1,
    address2: row.address2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    giftNote: row.gift_note,
    subtotal: row.subtotal,
    shipping: row.shipping,
    codFee: row.cod_fee,
    total: row.total,
    razorpayOrderId: row.razorpay_order_id,
    razorpayPaymentId: row.razorpay_payment_id,
    trackingNumber: row.tracking_number,
    carrier: row.carrier,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    items: items.map((i) => ({
      id: i.id,
      productSlug: i.product_slug,
      productName: i.product_name,
      colour: i.colour,
      size: i.size,
      unitPrice: i.unit_price,
      quantity: i.quantity,
    })),
  };
}

// ---------------------------------------------------------------------------
// Fulfilment (admin). Each transition is guarded in SQL so it only applies
// from valid prior states; the return value says whether it applied.

export async function markShipped(id: string, tracking: { number: string; carrier: string }) {
  const rows = await db()`
    update orders
       set status = 'shipped', tracking_number = ${tracking.number || null}, carrier = ${tracking.carrier || null},
           shipped_at = coalesce(shipped_at, now()), updated_at = now()
     where id = ${id} and status in ('paid', 'cod_confirmed', 'shipped')
    returning id`;
  return rows.length > 0;
}

export async function markDelivered(id: string) {
  return db().begin(async (tx) => {
    const rows = await tx`
      update orders set status = 'delivered', delivered_at = now(), updated_at = now()
       where id = ${id} and status = 'shipped'
      returning payment_method`;
    if (rows.length === 0) return false;
    // Cash on delivery is collected by the courier on handover.
    if (rows[0].payment_method === "cod") {
      await tx`update payments set status = 'captured', updated_at = now() where order_id = ${id} and provider = 'cod' and status = 'pending'`;
    }
    return true;
  });
}

/** Cancels an order and returns its stock. */
export async function cancelOrder(id: string) {
  return db().begin(async (tx) => {
    const rows = await tx`
      update orders set status = 'cancelled', updated_at = now()
       where id = ${id} and status in ('pending_payment', 'payment_failed', 'paid', 'cod_confirmed')
      returning id`;
    if (rows.length === 0) return false;
    await restoreStock(tx, id);
    await tx`update payments set status = 'cancelled', updated_at = now() where order_id = ${id} and status in ('created', 'pending', 'failed')`;
    return true;
  });
}

export type OrderSummary = Pick<Order, "id" | "number" | "status" | "paymentMethod" | "name" | "email" | "city" | "total" | "createdAt"> & {
  itemCount: number;
};

export async function listOrders(opts: { status?: OrderStatus; q?: string; limit?: number }): Promise<OrderSummary[]> {
  const sql = db();
  const q = opts.q?.trim();
  const rows = await sql`
    select o.id, o.number, o.status, o.payment_method, o.name, o.email, o.city, o.total, o.created_at,
           coalesce(sum(i.quantity), 0)::int as item_count
      from orders o left join order_items i on i.order_id = o.id
     where true
       ${opts.status ? sql`and o.status = ${opts.status}` : sql``}
       ${q ? sql`and (o.number ilike ${"%" + q + "%"} or o.email ilike ${"%" + q + "%"} or o.name ilike ${"%" + q + "%"} or o.phone ilike ${"%" + q + "%"})` : sql``}
     group by o.id
     order by o.created_at desc
     limit ${Math.min(opts.limit ?? 100, 500)}`;
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    paymentMethod: r.payment_method,
    name: r.name,
    email: r.email,
    city: r.city,
    total: r.total,
    createdAt: r.created_at,
    itemCount: r.item_count,
  }));
}

export async function orderCountsByStatus() {
  const rows = await db()`select status, count(*)::int as count from orders group by status`;
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<Record<OrderStatus, number>>;
}

/**
 * Atomically claims the right to send an email for an order, so concurrent
 * callers (browser confirmation + webhook) never send it twice.
 */
export async function claimEmail(id: string, kind: "confirmation" | "shipping") {
  const sql = db();
  const rows =
    kind === "confirmation"
      ? await sql`update orders set confirmation_email_sent_at = now() where id = ${id} and confirmation_email_sent_at is null returning id`
      : await sql`update orders set shipping_email_sent_at = now() where id = ${id} and shipping_email_sent_at is null returning id`;
  return rows.length > 0;
}

/** Releases a claim after a failed send so it can be retried. */
export async function releaseEmail(id: string, kind: "confirmation" | "shipping") {
  const sql = db();
  if (kind === "confirmation") await sql`update orders set confirmation_email_sent_at = null where id = ${id}`;
  else await sql`update orders set shipping_email_sent_at = null where id = ${id}`;
}
