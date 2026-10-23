import { after } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/db";
import { sendOrderConfirmation, sendReturnUpdate } from "@/lib/server/email";
import { getOrder, markOrderPaid, markPaymentFailed } from "@/lib/server/orders";
import { verifyWebhookSignature } from "@/lib/server/razorpay";
import { applyRefundWebhook, recordPaymentOnCancelledOrder, refundCancelledOrder } from "@/lib/server/returns";

/**
 * Razorpay webhook — the source of truth if the shopper closes the browser
 * before the client-side confirmation runs. Configure in the Razorpay
 * dashboard for events: payment.captured, order.paid, payment.failed,
 * refund.created, refund.processed, refund.failed.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature") ?? "")) {
    return new Response("Invalid signature", { status: 400 });
  }
  if (!isDatabaseConfigured()) return new Response("Database not configured", { status: 503 });

  type Payment = { id: string; order_id: string };
  type RefundEntity = { id: string; status?: string; notes?: { refund_id?: string } };
  let event: { event?: string; payload?: { payment?: { entity?: Payment }; refund?: { entity?: RefundEntity } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  try {
    const refund = event.payload?.refund?.entity;
    if (event.event?.startsWith("refund.")) {
      if (refund?.id) await applyRefundWebhook(event.event, refund);
      return Response.json({ received: true });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id) return Response.json({ ignored: true });

    if (event.event === "payment.captured" || event.event === "order.paid") {
      const paidId = await markOrderPaid({ razorpayOrderId: payment.order_id }, payment.id);
      if (paidId) after(() => sendOrderConfirmation(paidId));
      else {
        // Money arrived for an order we'd already cancelled: give it back.
        const cancelledId = await recordPaymentOnCancelledOrder(payment.order_id, payment.id);
        if (cancelledId) {
          const res = await refundCancelledOrder(cancelledId);
          if (res && !res.ok) console.error("[razorpay webhook] auto-refund failed", cancelledId, res.error);
          else if (res?.ok) {
            after(async () => {
              const order = await getOrder(cancelledId);
              if (order) await sendReturnUpdate(cancelledId, "cancel-refund", { amount: order.total, method: res.method });
            });
          }
        }
      }
    } else if (event.event === "payment.failed") {
      await markPaymentFailed(payment.order_id);
    }
  } catch (err) {
    console.error("[razorpay webhook] update failed", err);
    // Non-2xx makes Razorpay retry later.
    return new Response("Temporary failure", { status: 500 });
  }
  return Response.json({ received: true });
}
