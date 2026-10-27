import { policy } from "./site";

export type PaymentMethod = "razorpay" | "cod";

/**
 * Single source of truth for order totals — used by the cart UI and, with
 * catalogue prices re-resolved on the server, by order placement.
 * `discount` comes off the products only (never shipping or the COD fee), and
 * free shipping is judged on what the shopper pays for products after it.
 */
export function computeTotals(subtotal: number, method?: PaymentMethod, discount = 0) {
  const off = Math.max(0, Math.min(discount, subtotal));
  const goods = subtotal - off;
  const shipping = subtotal === 0 ? 0 : goods >= policy.freeShippingThreshold ? 0 : policy.standardShipping;
  const codFee = method === "cod" ? policy.codFee : 0;
  return { subtotal, discount: off, shipping, codFee, total: goods + shipping + codFee };
}

export function codAvailable(total: number) {
  return total > 0 && total <= policy.codMaxOrderValue;
}

/** What a coupon takes off a product subtotal, in whole rupees (never more than the subtotal). */
export function discountFor(rule: { type: string; value: number; maxDiscount: number | null }, subtotal: number) {
  const raw = rule.type === "percentage" ? Math.floor((subtotal * rule.value) / 100) : rule.value;
  const capped = rule.maxDiscount != null ? Math.min(raw, rule.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, subtotal));
}
