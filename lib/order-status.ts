export const statusLabel: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  cod_confirmed: "COD — to fulfil",
  payment_failed: "Payment failed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  expired: "Expired (unpaid)",
};

/** Badge colours (text on tinted background, ≥4.5:1). */
export const statusTone: Record<string, string> = {
  pending_payment: "bg-sand/60 text-graphite",
  paid: "bg-[#dfe9dc] text-[#244a2a]",
  cod_confirmed: "bg-[#f1e3c8] text-[#6a4a12]",
  payment_failed: "bg-[#f3dcd7] text-[#8a2a1c]",
  shipped: "bg-[#dbe4ee] text-[#1f3a5c]",
  delivered: "bg-obsidian text-ivory",
  cancelled: "bg-bone text-taupe line-through",
  expired: "bg-bone text-taupe",
};

/** Shopper-facing wording (the admin labels above are fulfilment-oriented). */
export const customerStatusLabel: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Confirmed",
  cod_confirmed: "Confirmed · Pay on delivery",
  payment_failed: "Payment failed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  expired: "Expired",
};
