import "server-only";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { isReturnWindowOpen, RETURN_REASONS, type Refund, type ReturnRequest, type ReturnStatus } from "@/lib/returns";
import { db } from "./db";
import { createRazorpayRefund, findRazorpayRefund, isRazorpayConfigured, RazorpayRejected, type RazorpayRefund } from "./razorpay";

/**
 * Returns and refunds. Every transition is a guarded UPDATE (it only applies
 * from the expected prior status), so double submits are harmless. Refund
 * totals are checked under a row lock on the order, and partial unique
 * indexes allow only one live refund per return / per cancellation.
 */

type Tx = postgres.TransactionSql<Record<string, never>>;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- reads

async function loadReturns(where: postgres.PendingQuery<postgres.Row[]>): Promise<ReturnRequest[]> {
  const sql = db();
  const rows = await sql`select * from returns where ${where} order by created_at desc`;
  if (rows.length === 0) return [];
  const items = await sql`
    select ri.return_id, ri.order_item_id::text as order_item_id, ri.quantity, oi.product_name, oi.colour, oi.size, oi.unit_price
      from return_items ri join order_items oi on oi.id = ri.order_item_id
     where ri.return_id in ${sql(rows.map((r) => r.id))}
     order by oi.id`;
  return rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    status: r.status,
    reason: r.reason,
    comment: r.comment,
    amount: r.amount,
    adminNote: r.admin_note,
    restocked: r.restocked,
    createdAt: r.created_at,
    items: items
      .filter((i) => i.return_id === r.id)
      .map((i) => ({
        orderItemId: i.order_item_id,
        productName: i.product_name,
        colour: i.colour,
        size: i.size,
        unitPrice: i.unit_price,
        quantity: i.quantity,
      })),
  }));
}

export function listReturnsForOrder(orderId: string) {
  return loadReturns(db()`order_id = ${orderId}`);
}

export async function getReturn(id: string) {
  if (!UUID.test(id)) return null;
  return (await loadReturns(db()`id = ${id}`))[0] ?? null;
}

export async function listRefunds(orderId: string): Promise<Refund[]> {
  const rows = await db()`select * from refunds where order_id = ${orderId} order by created_at`;
  return rows.map((r) => ({
    id: r.id,
    returnId: r.return_id,
    amount: r.amount,
    method: r.method,
    status: r.status,
    razorpayRefundId: r.razorpay_refund_id,
    reference: r.reference,
    error: r.error,
    createdAt: r.created_at,
  }));
}

export type ReturnSummary = {
  id: string;
  orderId: string;
  orderNumber: string;
  name: string;
  status: ReturnStatus;
  reason: string;
  amount: number;
  itemCount: number;
  createdAt: Date;
};

export async function listReturns(opts: { status?: ReturnStatus }): Promise<ReturnSummary[]> {
  const sql = db();
  const rows = await sql`
    select r.id, r.order_id, o.number, o.name, r.status, r.reason, r.amount, r.created_at,
           coalesce((select sum(quantity) from return_items where return_id = r.id), 0)::int as item_count
      from returns r join orders o on o.id = r.order_id
     ${opts.status ? sql`where r.status = ${opts.status}` : sql``}
     order by r.created_at desc
     limit 200`;
  return rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    orderNumber: r.number,
    name: r.name,
    status: r.status,
    reason: r.reason,
    amount: r.amount,
    itemCount: r.item_count,
    createdAt: r.created_at,
  }));
}

export async function returnCountsByStatus() {
  const rows = await db()`select status, count(*)::int as count from returns group by status`;
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<Record<ReturnStatus, number>>;
}

// ---------------------------------------------------------------- customer request

export async function createReturn(
  orderId: string,
  input: { items: { orderItemId: string; quantity: number }[]; reason: string; comment: string },
): Promise<Result<{ id: string }>> {
  if (!UUID.test(orderId)) return { ok: false, error: "Order not found." };
  const reason = (RETURN_REASONS as readonly string[]).includes(input.reason) ? input.reason : null;
  if (!reason) return { ok: false, error: "Please choose a reason for the return." };
  const wanted = input.items.filter((i) => Number.isInteger(i.quantity) && i.quantity > 0);
  if (wanted.length === 0) return { ok: false, error: "Choose at least one item to return." };
  const comment = input.comment.trim().slice(0, 500) || null;

  return db().begin(async (tx) => {
    const [order] = await tx`select status, delivered_at, subtotal, discount_amount from orders where id = ${orderId} for update`;
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status !== "delivered" || !order.delivered_at) {
      return { ok: false, error: "Returns can be requested once your order has been delivered." };
    }
    if (!isReturnWindowOpen(order.delivered_at)) {
      return { ok: false, error: "The return window for this order has closed." };
    }

    const items = await tx`
      select oi.id::text as id, oi.unit_price, oi.quantity,
             oi.quantity - coalesce((
               select sum(ri.quantity) from return_items ri join returns r on r.id = ri.return_id
                where ri.order_item_id = oi.id and r.status <> 'rejected'), 0)::int as returnable
        from order_items oi where oi.order_id = ${orderId}`;
    let amount = 0;
    for (const w of wanted) {
      const item = items.find((i) => i.id === w.orderItemId);
      if (!item || w.quantity > item.returnable) {
        return { ok: false, error: "Some of those items can't be returned. Please refresh and try again." };
      }
      amount += item.unit_price * w.quantity;
    }
    // A coupon took its share off every item: refund what was actually paid for these.
    if (order.discount_amount > 0 && order.subtotal > 0) {
      amount = Math.round((amount * (order.subtotal - order.discount_amount)) / order.subtotal);
    }

    const id = randomUUID();
    await tx`insert into returns (id, order_id, status, reason, comment, amount)
             values (${id}, ${orderId}, 'requested', ${reason}, ${comment}, ${amount})`;
    await tx`insert into return_items ${tx(wanted.map((w) => ({ return_id: id, order_item_id: w.orderItemId, quantity: w.quantity })))}`;
    return { ok: true as const, id };
  });
}

// ---------------------------------------------------------------- admin transitions

export async function approveReturn(id: string, note: string) {
  const rows = await db()`
    update returns set status = 'approved', admin_note = ${note || null}, updated_at = now()
     where id = ${id} and status = 'requested' returning id`;
  return rows.length > 0;
}

export async function rejectReturn(id: string, note: string) {
  const rows = await db()`
    update returns set status = 'rejected', admin_note = ${note || null}, updated_at = now()
     where id = ${id} and status in ('requested', 'approved') returning id`;
  return rows.length > 0;
}

/** Marks returned goods as arrived, optionally putting them back into tracked stock (once). */
export async function receiveReturn(id: string, restock: boolean) {
  return db().begin(async (tx) => {
    const rows = await tx`
      update returns set status = 'received', restocked = ${restock}, updated_at = now()
       where id = ${id} and status = 'approved' returning id`;
    if (rows.length === 0) return false;
    if (restock) {
      const items = await tx`
        select oi.variant_id, ri.quantity
          from return_items ri join order_items oi on oi.id = ri.order_item_id
         where ri.return_id = ${id} and oi.variant_id is not null`;
      for (const i of items) {
        await tx`update inventory set quantity = quantity + ${i.quantity}, updated_at = now() where variant_id = ${i.variant_id}`;
      }
    }
    return true;
  });
}

// ---------------------------------------------------------------- refunds

class RefundRejected extends Error {}

/**
 * Online orders are refunded through Razorpay to the original payment method;
 * COD orders are refunded by the team (UPI / bank transfer) and recorded here
 * with a reference.
 */
async function issueRefund(input: {
  orderId: string;
  returnId: string | null;
  amount?: number;
  reference?: string;
}): Promise<Result<{ refundId: string; method: "razorpay" | "manual" }>> {
  // An earlier attempt may be stuck pending without an answer from Razorpay:
  // settle it first, so this attempt either sees it refunded or may go ahead.
  await settleStalePending(input.orderId, input.returnId);
  const refundId = randomUUID();
  let prepared: { method: "razorpay" | "manual"; paymentId: string | null; number: string; amount: number };

  try {
    prepared = await db().begin(async (tx: Tx) => {
      const [order] = await tx`
        select payment_method, razorpay_payment_id, total, number from orders where id = ${input.orderId} for update`;
      if (!order) throw new RefundRejected("Order not found.");
      let amount = input.amount ?? order.total;
      if (input.returnId) {
        const [ret] = await tx`
          update returns set status = 'refunded', updated_at = now()
           where id = ${input.returnId} and order_id = ${input.orderId} and status = 'received'
          returning amount`;
        if (!ret) throw new RefundRejected("Only received returns can be refunded.");
        amount = ret.amount;
      }
      const method = order.payment_method === "razorpay" && order.razorpay_payment_id ? "razorpay" : "manual";
      const reference = input.reference?.trim().slice(0, 120) || null;
      if (method === "manual" && !reference) {
        throw new RefundRejected("Enter the UPI or bank transfer reference for this refund.");
      }
      if (method === "razorpay" && !isRazorpayConfigured()) {
        throw new RefundRejected("Razorpay keys aren't configured, so the refund can't be sent.");
      }
      const [{ refunded }] = await tx`
        select coalesce(sum(amount), 0)::int as refunded from refunds where order_id = ${input.orderId} and status <> 'failed'`;
      if (amount <= 0 || refunded + amount > order.total) {
        throw new RefundRejected("This refund would exceed the amount paid for the order.");
      }
      await tx`
        insert into refunds (id, order_id, return_id, amount, method, status, reference)
        values (${refundId}, ${input.orderId}, ${input.returnId}, ${amount}, ${method},
                ${method === "manual" ? "processed" : "pending"}, ${reference})`;
      return { method, paymentId: order.razorpay_payment_id as string | null, number: order.number as string, amount };
    });
  } catch (err) {
    // Thrown (not returned) so the transaction rolls back, e.g. the return's status change.
    if (err instanceof RefundRejected) return { ok: false, error: err.message };
    if ((err as { code?: string }).code === "23505") return { ok: false, error: "A refund for this is already in progress." };
    throw err;
  }

  if (prepared.method === "razorpay" && prepared.paymentId) {
    try {
      const rzp = await createRazorpayRefund({
        paymentId: prepared.paymentId,
        amountRupees: prepared.amount,
        refundId,
        receipt: `${prepared.number}-${refundId.slice(0, 8)}`,
      });
      await recordRazorpayRefund(refundId, rzp);
    } catch (err) {
      console.error("[refund] Razorpay refund failed", err);
      const detail = err instanceof Error ? err.message.slice(0, 300) : "Refund request failed.";
      if (err instanceof RazorpayRejected) {
        await markRefundFailed(refundId, detail);
        return { ok: false, error: "Razorpay didn't accept the refund. Nothing was refunded — check the error below and try again." };
      }
      // No clear answer (timeout, network, 5xx): Razorpay may have created the
      // refund anyway. Retrying blindly could refund twice, so check first.
      const settled = await settleUnconfirmedRefund(refundId, prepared.paymentId);
      if (settled === "refunded") return { ok: true, refundId, method: prepared.method };
      if (settled === "not_found") {
        return { ok: false, error: "Razorpay didn't accept the refund. Nothing was refunded — check the error below and try again." };
      }
      return {
        ok: false,
        error: "Razorpay didn't respond, so it isn't known yet whether the refund went through. It stays pending and updates when Razorpay confirms it. Don't refund again — trying later re-checks with Razorpay first.",
      };
    }
  }
  return { ok: true, refundId, method: prepared.method };
}

async function recordRazorpayRefund(refundId: string, rzp: RazorpayRefund) {
  await db()`
    update refunds set razorpay_refund_id = ${rzp.id}, error = null, updated_at = now(),
           status = ${rzp.status === "processed" ? "processed" : rzp.status === "failed" ? "failed" : "initiated"}
     where id = ${refundId} and status = 'pending'`;
  if (rzp.status === "failed") await markRefundFailed(refundId, "Razorpay reported the refund as failed.");
}

/**
 * Resolves a refund whose request got no clear answer by asking Razorpay for
 * it (matched by notes.refund_id). "unknown" leaves it pending, which keeps a
 * second refund from being issued until the outcome is known.
 */
async function settleUnconfirmedRefund(refundId: string, paymentId: string): Promise<"refunded" | "not_found" | "unknown"> {
  let found: RazorpayRefund | null;
  try {
    found = await findRazorpayRefund(paymentId, refundId);
  } catch (err) {
    console.error("[refund] Razorpay refund lookup failed", refundId, err);
    await db()`
      update refunds set error = ${"No response from Razorpay; waiting for its confirmation."}, updated_at = now()
       where id = ${refundId} and status = 'pending'`;
    return "unknown";
  }
  if (!found) {
    await markRefundFailed(refundId, "The refund request didn't reach Razorpay.");
    return "not_found";
  }
  await recordRazorpayRefund(refundId, found);
  return found.status === "failed" ? "not_found" : "refunded";
}

/**
 * Re-checks an online refund for this return (or cancellation) still pending
 * from an earlier attempt that got no answer. Only rows untouched for a
 * minute, so a request still in flight is never second-guessed.
 */
async function settleStalePending(orderId: string, returnId: string | null) {
  const sql = db();
  const [pending] = await sql`
    select r.id, o.razorpay_payment_id
      from refunds r join orders o on o.id = r.order_id
     where r.order_id = ${orderId} and r.status = 'pending' and r.method = 'razorpay'
       and r.updated_at < now() - interval '1 minute'
       and ${returnId ? sql`r.return_id = ${returnId}` : sql`r.return_id is null`}`;
  if (pending?.razorpay_payment_id) await settleUnconfirmedRefund(pending.id, pending.razorpay_payment_id);
}

/** Marks a refund failed and re-opens its return so it can be retried. */
async function markRefundFailed(refundId: string, error: string) {
  await db().begin(async (tx) => {
    const [row] = await tx`
      update refunds set status = 'failed', error = ${error}, updated_at = now()
       where id = ${refundId} and status <> 'failed' returning return_id`;
    if (row?.return_id) {
      await tx`update returns set status = 'received', updated_at = now() where id = ${row.return_id} and status = 'refunded'`;
    }
  });
}

export function refundReturn(orderId: string, returnId: string, reference?: string) {
  return issueRefund({ orderId, returnId, reference });
}

/** Refunds the full amount of a cancelled order that was paid online. */
export async function refundCancelledOrder(orderId: string): Promise<Result<{ refundId: string; method: "razorpay" | "manual" }> | null> {
  const [order] = await db()`select status, payment_method, razorpay_payment_id from orders where id = ${orderId}`;
  if (!order || order.status !== "cancelled" || order.payment_method !== "razorpay" || !order.razorpay_payment_id) return null;
  return issueRefund({ orderId, returnId: null });
}

/**
 * A payment captured for an order that was already cancelled or expired
 * (e.g. the shopper paid after we gave up on them). Records the payment on a
 * cancelled order so it can be refunded. Returns the order id if it applies.
 */
export async function recordPaymentOnCancelledOrder(razorpayOrderId: string, paymentId: string) {
  const [row] = await db()`
    update orders set razorpay_payment_id = ${paymentId}, updated_at = now()
     where razorpay_order_id = ${razorpayOrderId} and status = 'cancelled' and razorpay_payment_id is null
    returning id`;
  return (row?.id as string | undefined) ?? null;
}

/** Applies a Razorpay refund.* webhook event. */
export async function applyRefundWebhook(event: string, refund: { id: string; status?: string; notes?: { refund_id?: string } }) {
  const ours = UUID.test(refund.notes?.refund_id ?? "") ? refund.notes!.refund_id! : null;
  const sql = db();
  const [row] = await sql`
    select id from refunds where razorpay_refund_id = ${refund.id} ${ours ? sql`or id = ${ours}` : sql``} limit 1`;
  if (!row) return false;
  if (event === "refund.failed") {
    await markRefundFailed(row.id, "Razorpay reported the refund as failed.");
  } else if (event === "refund.processed") {
    // Also covers a refund we marked failed after a timeout that Razorpay did in fact process.
    await sql.begin(async (tx) => {
      const [r] = await tx`
        update refunds set status = 'processed', razorpay_refund_id = ${refund.id}, error = null, updated_at = now()
         where id = ${row.id} and status <> 'processed' returning return_id`;
      if (r?.return_id) {
        await tx`update returns set status = 'refunded', updated_at = now() where id = ${r.return_id} and status = 'received'`;
      }
    });
  } else if (event === "refund.created") {
    await sql`update refunds set status = 'initiated', razorpay_refund_id = ${refund.id}, updated_at = now()
               where id = ${row.id} and status = 'pending'`;
  }
  return true;
}
