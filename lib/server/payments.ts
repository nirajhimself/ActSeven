import "server-only";
import { db } from "./db";
import { sendOrderConfirmation, sendReturnUpdate } from "./email";
import { getOrder, markOrderPaid, markPaymentFailed } from "./orders";
import { verifyWebhookSignature } from "./razorpay";
import { applyRefundWebhook, recordPaymentOnCancelledOrder, refundCancelledOrder } from "./returns";

/**
 * Razorpay webhook processing (the route in app/api/razorpay/webhook only
 * adapts HTTP). Security and reliability rules:
 * - The signature over the raw body is verified before anything else.
 * - Each event id is processed once; repeated deliveries are acknowledged
 *   and ignored (every update is also idempotent on its own).
 * - A payment only marks an order paid if its amount and currency exactly
 *   match the order; mismatches are rejected and recorded for review.
 * Configure in the Razorpay dashboard for: payment.captured, order.paid,
 * payment.failed, refund.created, refund.processed, refund.failed.
 */

type Payment = { id: string; order_id: string; amount?: number; currency?: string; status?: string };
type RefundEntity = { id: string; status?: string; notes?: { refund_id?: string } };
type RazorpayEvent = {
  event?: string;
  payload?: { payment?: { entity?: Payment }; refund?: { entity?: RefundEntity } };
};

export type WebhookResult = {
  status: number;
  body: Record<string, unknown> | string;
  /** Work to run after responding (emails). */
  followUps: (() => Promise<void>)[];
};

const done = (body: Record<string, unknown>, followUps: WebhookResult["followUps"] = []): WebhookResult => ({ status: 200, body, followUps });

async function alreadyProcessed(eventId: string | null) {
  if (!eventId) return false;
  const [row] = await db()`select 1 from payment_events where id = ${eventId}`;
  return Boolean(row);
}

async function recordEvent(eventId: string | null, event: string, outcome: "processed" | "ignored" | "rejected", note?: string) {
  if (!eventId) return;
  await db()`
    insert into payment_events (id, provider, event, outcome, note)
    values (${eventId}, 'razorpay', ${event.slice(0, 60)}, ${outcome}, ${note?.slice(0, 500) ?? null})
    on conflict (id) do nothing`;
}

export async function processRazorpayWebhook(raw: string, signature: string, eventId: string | null): Promise<WebhookResult> {
  if (!verifyWebhookSignature(raw, signature)) return { status: 400, body: "Invalid signature", followUps: [] };
  const id = eventId && /^[A-Za-z0-9_-]{1,100}$/.test(eventId) ? eventId : null;

  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return { status: 400, body: "Bad payload", followUps: [] };
  }
  const name = String(event.event ?? "unknown");
  if (await alreadyProcessed(id)) return done({ received: true, duplicate: true });

  const followUps: WebhookResult["followUps"] = [];

  if (name.startsWith("refund.")) {
    const refund = event.payload?.refund?.entity;
    const matched = refund?.id ? await applyRefundWebhook(name, refund) : false;
    await recordEvent(id, name, matched ? "processed" : "ignored");
    return done({ received: true });
  }

  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id || !payment.id) {
    await recordEvent(id, name, "ignored", "no payment entity");
    return done({ ignored: true });
  }

  if (name === "payment.captured" || name === "order.paid") {
    // The amount and currency must match the order exactly.
    const [order] = await db()`select id, total, status from orders where razorpay_order_id = ${payment.order_id}`;
    if (order && order.status !== "cancelled") {
      const expected = (order.total as number) * 100;
      if (payment.amount !== expected || (payment.currency ?? "INR") !== "INR") {
        const note = `amount mismatch: paid ${payment.amount} ${payment.currency ?? "?"}, expected ${expected} INR (order ${order.id})`;
        console.error("[razorpay webhook] REJECTED", note);
        await recordEvent(id, name, "rejected", note);
        return done({ received: true, rejected: "amount mismatch" });
      }
    }

    const paidId = await markOrderPaid({ razorpayOrderId: payment.order_id }, payment.id);
    if (paidId) {
      followUps.push(() => sendOrderConfirmation(paidId));
    } else {
      // Money arrived for an order we'd already cancelled: give it back.
      const cancelledId = await recordPaymentOnCancelledOrder(payment.order_id, payment.id);
      if (cancelledId) {
        const res = await refundCancelledOrder(cancelledId);
        if (res && !res.ok) console.error("[razorpay webhook] auto-refund failed", cancelledId, res.error);
        else if (res?.ok) {
          followUps.push(async () => {
            const o = await getOrder(cancelledId);
            if (o) await sendReturnUpdate(cancelledId, "cancel-refund", { amount: o.total, method: res.method });
          });
        }
      }
    }
    await recordEvent(id, name, paidId ? "processed" : "ignored", paidId ? undefined : "no payable order");
    return done({ received: true }, followUps);
  }

  if (name === "payment.failed") {
    await markPaymentFailed(payment.order_id);
    await recordEvent(id, name, "processed");
    return done({ received: true });
  }

  await recordEvent(id, name, "ignored", "event not handled");
  return done({ ignored: true });
}

/** Recent notifications for the admin overview. */
export async function recentPaymentEvents(limit = 10) {
  const rows = await db()`select id, event, outcome, note, received_at from payment_events order by received_at desc limit ${limit}`;
  return rows.map((r) => ({ id: r.id as string, event: r.event as string, outcome: r.outcome as string, note: r.note as string | null, receivedAt: r.received_at as Date }));
}
