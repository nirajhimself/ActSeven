const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Formats whole rupees with Indian digit grouping, e.g. ₹1,24,999. */
export function formatINR(amount: number) {
  return inr.format(amount);
}

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}
