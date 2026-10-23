import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.razorpay.com/v1";

export function isRazorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function razorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

/** Creates a Razorpay order. Amount is in rupees; Razorpay expects paise. */
export async function createRazorpayOrder(input: { amountRupees: number; receipt: string; orderId: string }) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountRupees * 100,
      currency: "INR",
      receipt: input.receipt,
      notes: { order_id: input.orderId },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Razorpay order creation failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as { id: string; amount: number; currency: string };
}

/**
 * Refunds (part of) a captured payment. Amount is in rupees. `notes.refund_id`
 * lets the webhook reconcile a refund whose response we never recorded.
 */
export async function createRazorpayRefund(input: { paymentId: string; amountRupees: number; refundId: string; receipt: string }) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${API}/payments/${encodeURIComponent(input.paymentId)}/refund`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountRupees * 100,
      speed: "normal",
      receipt: input.receipt.slice(0, 40),
      notes: { refund_id: input.refundId },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Razorpay refund failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as { id: string; status: "pending" | "processed" | "failed" };
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Checkout handler signature: HMAC-SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(razorpayOrderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${razorpayOrderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
