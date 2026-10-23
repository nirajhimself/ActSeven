import { policy } from "./site";

export type ReturnStatus = "requested" | "approved" | "rejected" | "received" | "refunded";
export type RefundStatus = "pending" | "initiated" | "processed" | "failed";

export const RETURN_REASONS = [
  "Doesn't fit",
  "Not as described",
  "Arrived damaged or faulty",
  "Changed my mind",
  "Other",
] as const;

export type ReturnRequest = {
  id: string;
  orderId: string;
  status: ReturnStatus;
  reason: string;
  comment: string | null;
  amount: number;
  adminNote: string | null;
  restocked: boolean;
  createdAt: Date;
  items: { orderItemId: string; productName: string; colour: string; size: string; unitPrice: number; quantity: number }[];
};

export type Refund = {
  id: string;
  returnId: string | null;
  amount: number;
  method: "razorpay" | "manual";
  status: RefundStatus;
  razorpayRefundId: string | null;
  reference: string | null;
  error: string | null;
  createdAt: Date;
};

const DAY = 24 * 60 * 60 * 1000;

/** Last moment a return can be requested for an order delivered at `deliveredAt`. */
export function returnWindowEnds(deliveredAt: Date) {
  return new Date(deliveredAt.getTime() + policy.returnWindowDays * DAY);
}

export function isReturnWindowOpen(deliveredAt: Date | null) {
  return deliveredAt !== null && Date.now() <= returnWindowEnds(deliveredAt).getTime();
}

/** Quantity of each order item still available to return (rejected requests free their items again). */
export function returnableQuantities(
  items: { id: string; quantity: number }[],
  returns: Pick<ReturnRequest, "status" | "items">[],
): Record<string, number> {
  const left: Record<string, number> = Object.fromEntries(items.map((i) => [i.id, i.quantity]));
  for (const r of returns) {
    if (r.status === "rejected") continue;
    for (const i of r.items) left[i.orderItemId] = Math.max(0, (left[i.orderItemId] ?? 0) - i.quantity);
  }
  return left;
}

/** Shopper-facing wording. */
export const returnStatusLabel: Record<ReturnStatus, string> = {
  requested: "Return requested",
  approved: "Return approved",
  rejected: "Return declined",
  received: "Return received",
  refunded: "Refunded",
};

export const returnStatusTone: Record<ReturnStatus, string> = {
  requested: "bg-sand/60 text-graphite",
  approved: "bg-[#dbe4ee] text-[#1f3a5c]",
  rejected: "bg-[#f3dcd7] text-[#8a2a1c]",
  received: "bg-[#f1e3c8] text-[#6a4a12]",
  refunded: "bg-[#dfe9dc] text-[#244a2a]",
};

export const refundStatusLabel: Record<RefundStatus, string> = {
  pending: "Refund processing",
  initiated: "Refund initiated",
  processed: "Refunded",
  failed: "Refund failed",
};
