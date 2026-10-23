import { policy } from "./site";

export type PaymentMethod = "razorpay" | "cod";

/**
 * Single source of truth for order totals — used by the cart UI and, with
 * catalogue prices re-resolved on the server, by order placement.
 */
export function computeTotals(subtotal: number, method?: PaymentMethod) {
  const shipping = subtotal === 0 ? 0 : subtotal >= policy.freeShippingThreshold ? 0 : policy.standardShipping;
  const codFee = method === "cod" ? policy.codFee : 0;
  return { subtotal, shipping, codFee, total: subtotal + shipping + codFee };
}

export function codAvailable(total: number) {
  return total > 0 && total <= policy.codMaxOrderValue;
}
