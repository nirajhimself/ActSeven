"use server";

import { randomBytes } from "node:crypto";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { validateAddress } from "@/lib/address-validation";
import { codAvailable, computeTotals, type PaymentMethod } from "@/lib/pricing";
import { getCurrentCustomer, normaliseEmail } from "@/lib/server/auth";
import { fillProfileGaps, rememberAddress } from "@/lib/server/customers";
import { CATALOG_TAG, getCheckoutVariants, type CheckoutVariant } from "@/lib/server/catalog";
import { isDatabaseConfigured, isSampleDatabase } from "@/lib/server/db";
import { expireStalePendingOrders, OutOfStockError } from "@/lib/server/inventory";
import { sendOrderConfirmation } from "@/lib/server/email";
import {
  attachRazorpayOrder,
  createOrder,
  DuplicateCheckoutError,
  findOrderByCheckoutToken,
  markOrderPaid,
  releaseUnpaidOrder,
  type OrderItemInput,
} from "@/lib/server/orders";
import { clearCustomerCart } from "@/lib/server/cart";
import { createRazorpayOrder, isRazorpayConfigured, razorpayKeyId, verifyPaymentSignature } from "@/lib/server/razorpay";
import { policy } from "@/lib/site";

export type CheckoutFields = {
  email: string;
  phone: string;
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
};

export type PlaceOrderInput = {
  fields: CheckoutFields;
  method: PaymentMethod;
  giftNote: string;
  lines: { slug: string; colour: string; size: string; quantity: number }[];
  /** Random id for this checkout attempt; a retry with the same token returns the same order. */
  checkoutToken?: string;
  /** The total the shopper was shown. If the server's total differs, nothing is placed. */
  expectedTotal?: number;
};

export type PlaceOrderResult =
  | { ok: false; error: string; code?: "PRICE_CHANGED"; fieldErrors?: Partial<Record<keyof CheckoutFields, string>> }
  | { ok: true; method: "cod"; orderId: string }
  | {
      ok: true;
      method: "razorpay";
      orderId: string;
      razorpay: { keyId: string; orderId: string; amount: number; currency: string; prefill: { name: string; email: string; contact: string } };
    };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function validateFields(raw: CheckoutFields) {
  const email = str(raw?.email, 254).toLowerCase();
  const { value, errors } = validateAddress(raw ?? {});
  const fieldErrors: Partial<Record<keyof CheckoutFields, string>> = { ...errors };
  if (!normaliseEmail(email)) fieldErrors.email = "Enter a valid email address.";
  return { fields: { ...value, email }, errors: fieldErrors };
}

/**
 * Re-prices every line from the database — client prices are never trusted —
 * and checks current stock. (The order transaction re-checks stock under a
 * row lock; this early check just gives a clearer message.)
 */
async function priceLines(raw: PlaceOrderInput["lines"] | undefined): Promise<{ ok: true; items: OrderItemInput[] } | { ok: false; error: string }> {
  const lines = Array.isArray(raw) ? raw.slice(0, 50) : [];
  if (lines.length === 0) return { ok: false, error: "Your bag is empty." };
  const variants = await getCheckoutVariants(lines.map((l) => String(l?.slug)));
  const items: OrderItemInput[] = [];
  for (const line of lines) {
    const v: CheckoutVariant | undefined = variants.get(`${line?.slug}|${line?.colour}|${line?.size}`);
    const quantity = Math.floor(Number(line?.quantity));
    if (!v) {
      return { ok: false, error: "Some items in your bag are no longer available. Please review your bag and try again." };
    }
    if (!(quantity >= 1 && quantity <= policy.maxQuantityPerLine)) {
      return { ok: false, error: "Please check the quantities in your bag and try again." };
    }
    if (v.stock < quantity) return { ok: false, error: outOfStockMessage(v.name, v.colour, v.size, v.stock) };
    items.push({ variantId: v.variantId, sku: v.sku, slug: v.slug, name: v.name, colour: v.colour, size: v.size, unitPrice: v.price, quantity });
  }
  return { ok: true, items };
}

function outOfStockMessage(name: string, colour: string, size: string, available: number) {
  const label = `${name} (${colour}, size ${size})`;
  return available > 0
    ? `${label} has only ${available} left. Please update your bag and try again.`
    : `${label} has sold out. Please remove it from your bag and try again.`;
}

export type TestOrderReceipt = {
  reference: string;
  placedAt: string;
  email: string;
  delivery: Omit<CheckoutFields, "email">;
  giftNote: string;
  items: OrderItemInput[];
  totals: { subtotal: number; shipping: number; codFee: number; total: number };
};

/**
 * Test checkout, used while the store runs on the local sample database
 * (see isSampleDatabase). Runs the same
 * validation and server-side pricing as a real order, but nothing is stored,
 * charged or shipped — the receipt is returned to the browser and is clearly
 * labelled as a test there.
 */
export async function placeTestOrder(
  input: Omit<PlaceOrderInput, "method">,
): Promise<{ ok: true; receipt: TestOrderReceipt } | { ok: false; error: string; fieldErrors?: Partial<Record<keyof CheckoutFields, string>> }> {
  if (!isSampleDatabase()) {
    return { ok: false, error: "Test checkout is turned off now that the store is connected. Please refresh the page." };
  }
  const { fields, errors } = validateFields(input?.fields ?? ({} as CheckoutFields));
  if (Object.keys(errors).length) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: errors };
  }
  const priced = await priceLines(input?.lines);
  if (!priced.ok) return priced;
  const subtotal = priced.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const { email, ...delivery } = fields;
  return {
    ok: true,
    receipt: {
      reference: `TEST-${randomBytes(3).toString("hex").toUpperCase()}`,
      placedAt: new Date().toISOString(),
      email,
      delivery,
      giftNote: str(input.giftNote, 200),
      items: priced.items,
      totals: computeTotals(subtotal, "razorpay"),
    },
  };
}

/**
 * Result for a checkout attempt that already created an order (a retried or
 * double submission). Online orders still awaiting payment reopen the same
 * Razorpay order; anything else just goes to the order page.
 */
function resumeExistingOrder(existing: NonNullable<Awaited<ReturnType<typeof findOrderByCheckoutToken>>>): PlaceOrderResult {
  if (existing.paymentMethod === "razorpay" && existing.status === "pending_payment" && existing.razorpayOrderId) {
    return {
      ok: true,
      method: "razorpay",
      orderId: existing.id,
      razorpay: {
        keyId: razorpayKeyId(),
        orderId: existing.razorpayOrderId,
        amount: existing.total * 100,
        currency: "INR",
        prefill: { name: existing.name, email: existing.email, contact: existing.phone },
      },
    };
  }
  if (existing.paymentMethod === "razorpay" && existing.status !== "paid") {
    return { ok: false, error: "This checkout couldn't be completed. Please refresh the page and try again." };
  }
  return { ok: true, method: "cod", orderId: existing.id };
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Ordering isn't available yet — the store database hasn't been connected." };
  }

  const method: PaymentMethod = input?.method === "cod" ? "cod" : "razorpay";
  const { fields, errors } = validateFields(input?.fields ?? ({} as CheckoutFields));
  if (Object.keys(errors).length) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: errors };
  }

  // A retried submission of a checkout that already created an order gets that order back.
  const checkoutToken = typeof input.checkoutToken === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(input.checkoutToken) ? input.checkoutToken : null;
  if (checkoutToken) {
    const existing = await findOrderByCheckoutToken(checkoutToken);
    if (existing) return resumeExistingOrder(existing);
  }

  const priced = await priceLines(input?.lines);
  if (!priced.ok) return priced;
  const items = priced.items;

  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const totals = computeTotals(subtotal, method);

  // Never charge a total the shopper didn't see (e.g. a price changed after the page loaded).
  if (typeof input.expectedTotal === "number" && input.expectedTotal !== totals.total) {
    return {
      ok: false,
      code: "PRICE_CHANGED",
      error: "Prices or availability changed while you were checking out. We've updated your order summary. Please review the new total and place your order again.",
    };
  }

  if (method === "cod" && !codAvailable(totals.total)) {
    return { ok: false, error: "Cash on delivery isn't available for this order value. Please pay online." };
  }
  if (method === "razorpay" && !isRazorpayConfigured()) {
    return { ok: false, error: "Online payment isn't available yet. Please choose cash on delivery." };
  }

  try {
    // Opportunistically release stock held by abandoned online payments.
    after(() => expireStalePendingOrders().catch((e) => console.error("[checkout] expire sweep", e)));
    const account = await getCurrentCustomer();
    const order = await createOrder({
      customer: { ...fields, giftNote: str(input.giftNote, 200) },
      items,
      method,
      totals,
      customerId: account?.id,
      checkoutToken,
    });
    // Stock changed: refresh cached availability on listings (stale-while-revalidate).
    revalidateTag(CATALOG_TAG, "max");
    if (account) {
      // Remember the delivery details on the account for next time.
      after(async () => {
        const { name, phone, address1, address2, city, state, pincode } = fields;
        await rememberAddress(account.id, { name, phone, address1, address2, city, state, pincode }).catch((e) =>
          console.error("[checkout] rememberAddress", e),
        );
        await fillProfileGaps(account.id, { name: fields.name, phone: fields.phone }).catch(() => {});
      });
    }

    if (method === "cod") {
      after(() => sendOrderConfirmation(order.id));
      // The order is placed: empty the bag saved on the account too.
      if (account) after(() => clearCustomerCart(account.id).catch(() => {}));
      return { ok: true, method: "cod", orderId: order.id };
    }

    let rzp: Awaited<ReturnType<typeof createRazorpayOrder>>;
    try {
      rzp = await createRazorpayOrder({ amountRupees: totals.total, receipt: order.number, orderId: order.id });
      await attachRazorpayOrder(order.id, rzp.id);
    } catch (err) {
      // The gateway is unreachable: don't leave stock held by an order nobody can pay.
      await releaseUnpaidOrder(order.id).catch(() => {});
      throw err;
    }
    return {
      ok: true,
      method: "razorpay",
      orderId: order.id,
      razorpay: {
        keyId: razorpayKeyId(),
        orderId: rzp.id,
        amount: rzp.amount,
        currency: rzp.currency,
        prefill: { name: fields.name, email: fields.email, contact: fields.phone },
      },
    };
  } catch (err) {
    // Two submissions of the same checkout raced; return the one that won.
    if (err instanceof DuplicateCheckoutError && checkoutToken) {
      const existing = await findOrderByCheckoutToken(checkoutToken);
      if (existing) return resumeExistingOrder(existing);
    }
    if (err instanceof OutOfStockError) {
      const item = items.find((i) => i.slug === err.slug && i.colour === err.colour && i.size === err.size);
      return { ok: false, error: outOfStockMessage(item?.name ?? "An item in your bag", err.colour, err.size, err.available) };
    }
    console.error("[checkout] placeOrder failed", err);
    return { ok: false, error: "We couldn't place your order just now. Nothing has been charged — please try again." };
  }
}

/** Called after Razorpay Checkout succeeds; confirms only if the signature is genuine. */
export async function confirmRazorpayPayment(input: {
  orderId: string;
  razorpayOrderId: string;
  paymentId: string;
  signature: string;
}): Promise<{ ok: boolean }> {
  const { orderId, razorpayOrderId, paymentId, signature } = input ?? {};
  if (![orderId, razorpayOrderId, paymentId, signature].every((v) => typeof v === "string" && v.length > 0 && v.length < 200)) {
    return { ok: false };
  }
  if (!verifyPaymentSignature(razorpayOrderId, paymentId, signature)) return { ok: false };
  try {
    const paidId = await markOrderPaid({ orderId, razorpayOrderId }, paymentId);
    if (paidId) {
      after(() => sendOrderConfirmation(paidId));
      const account = await getCurrentCustomer().catch(() => null);
      if (account) after(() => clearCustomerCart(account.id).catch(() => {}));
    }
    return { ok: Boolean(paidId) };
  } catch (err) {
    console.error("[checkout] confirmRazorpayPayment failed", err);
    return { ok: false };
  }
}
