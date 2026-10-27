import "server-only";
import { computeTotals, type PaymentMethod } from "@/lib/pricing";
import { policy } from "@/lib/site";
import { previewDiscount, type AppliedDiscount } from "./discounts";
import { prisma, withReadRetry } from "./prisma";
import { getCheckoutVariants, type CheckoutVariant } from "./products";

/**
 * Server-side cart: checks a bag against live prices and stock, and stores
 * signed-in customers' bags so they follow them across devices.
 * The browser is never trusted for prices or availability.
 */

export type CartLineInput = { slug: string; colour: string; size: string; quantity: number };

export type CartLineStatus =
  | "ok"
  | "low" // fewer units left than requested
  | "sold-out"
  | "unavailable" // product or variant no longer sold
  | "invalid-quantity";

export type CheckedLine = CartLineInput & {
  key: string;
  status: CartLineStatus;
  /** Units that can be bought right now (0 when sold out / unavailable). */
  available: number;
  /** Current price in rupees (null when unavailable). */
  unitPrice: number | null;
  sku: string | null;
};

export type CartCheck = {
  lines: CheckedLine[];
  /** True if any line would make checkout fail. */
  blocking: boolean;
  /** Totals for the lines that can be bought, priced on the server (including a valid discount). */
  totals: ReturnType<typeof computeTotals>;
  /** The coupon asked about, if any: applied, or why it can't be. */
  discount?: ({ ok: true } & AppliedDiscount) | { ok: false; code: string; error: string };
};

export const lineKey = (l: { slug: string; colour: string; size: string }) => `${l.slug}|${l.colour}|${l.size}`;

/** Normalises untrusted input: valid shape, at most 50 lines, merges duplicates. */
export function cleanLines(raw: unknown): CartLineInput[] {
  const merged = new Map<string, CartLineInput>();
  for (const l of Array.isArray(raw) ? raw.slice(0, 50) : []) {
    const line = {
      slug: String(l?.slug ?? "").slice(0, 120),
      colour: String(l?.colour ?? "").slice(0, 60),
      size: String(l?.size ?? "").slice(0, 20),
      quantity: Math.floor(Number(l?.quantity)),
    };
    if (!line.slug || !line.colour || !line.size || !Number.isFinite(line.quantity)) continue;
    const key = lineKey(line);
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, quantity: prev.quantity + line.quantity } : line);
  }
  return [...merged.values()];
}

/** Pure check of lines against known variants (exported for tests). */
export function checkLines(lines: CartLineInput[], variants: Map<string, CheckoutVariant>, method?: PaymentMethod): CartCheck {
  const checked = lines.map((line): CheckedLine => {
    const key = lineKey(line);
    const v = variants.get(key);
    if (!v) return { ...line, key, status: "unavailable", available: 0, unitPrice: null, sku: null };
    const base = { ...line, key, unitPrice: v.price, sku: v.sku, available: Math.max(0, Math.min(v.stock, policy.maxQuantityPerLine)) };
    if (!(line.quantity >= 1 && line.quantity <= policy.maxQuantityPerLine)) return { ...base, status: "invalid-quantity" };
    if (v.stock <= 0) return { ...base, status: "sold-out", available: 0 };
    if (v.stock < line.quantity) return { ...base, status: "low" };
    return { ...base, status: "ok" };
  });
  const subtotal = checked.reduce((sum, l) => (l.status === "ok" && l.unitPrice !== null ? sum + l.unitPrice * l.quantity : sum), 0);
  return { lines: checked, blocking: checked.some((l) => l.status !== "ok"), totals: computeTotals(subtotal, method) };
}

/** Checks a bag against the database (live prices and stock), and a coupon code if given. */
export async function checkCart(raw: unknown, method?: PaymentMethod, code?: unknown): Promise<CartCheck> {
  const lines = cleanLines(raw);
  if (lines.length === 0) return { lines: [], blocking: false, totals: computeTotals(0, method) };
  const check = checkLines(lines, await getCheckoutVariants(lines.map((l) => l.slug)), method);
  if (code === undefined || code === null || code === "") return check;
  const result = await previewDiscount(code, check.totals.subtotal);
  if (!result.ok) return { ...check, discount: { ok: false, code: String(code).slice(0, 40), error: result.error } };
  return {
    ...check,
    totals: computeTotals(check.totals.subtotal, method, result.discount.amount),
    discount: { ok: true, ...result.discount },
  };
}

// ---------------------------------------------------------------- account carts

/** A customer's saved bag (lines whose variant no longer exists are dropped by the FK cascade). */
export async function getCustomerCart(customerId: string): Promise<CartLineInput[]> {
  const rows = await withReadRetry(() =>
    prisma().cartItem.findMany({
      relationLoadStrategy: "join",
      where: { customerId },
      orderBy: { updatedAt: "asc" },
      select: {
        quantity: true,
        variant: { select: { product: { select: { slug: true } }, colour: { select: { name: true } }, size: { select: { label: true } } } },
      },
    }),
  );
  return rows.map((r) => ({ slug: r.variant.product.slug, colour: r.variant.colour.name, size: r.variant.size.label, quantity: r.quantity }));
}

/**
 * Replaces a customer's saved bag. Only lines that map to a real, active
 * variant are stored; quantities are clamped to the per-line limit.
 */
export async function saveCustomerCart(customerId: string, raw: unknown) {
  const lines = cleanLines(raw);
  const variants = await getCheckoutVariants(lines.map((l) => l.slug));
  const rows = lines.flatMap((l) => {
    const v = variants.get(lineKey(l));
    return v ? [{ customerId, variantId: v.variantId, quantity: Math.min(Math.max(l.quantity, 1), policy.maxQuantityPerLine) }] : [];
  });
  const db = prisma();
  await db.$transaction([db.cartItem.deleteMany({ where: { customerId } }), db.cartItem.createMany({ data: rows })]);
  return rows.length;
}

/**
 * Merges the device bag with the saved one.
 *
 * With `base` (the bag this device last synced), it's a three-way merge:
 * lines the device changed since then keep the device's version (including
 * removals); lines it didn't touch follow the saved bag — so an item ordered
 * or removed on another device doesn't come back from this one.
 *
 * Without `base` (first sync on this device, e.g. a guest bag joining the
 * account), both bags are kept and a line in both takes the larger quantity —
 * never the sum, so syncing twice can't double it.
 */
export function mergeCartLines(saved: CartLineInput[], device: CartLineInput[], base?: CartLineInput[] | null): CartLineInput[] {
  const s = new Map(saved.map((l) => [lineKey(l), l]));
  const d = new Map(device.map((l) => [lineKey(l), l]));
  const b = base ? new Map(base.map((l) => [lineKey(l), l])) : null;
  const result: CartLineInput[] = [];
  for (const key of new Set([...s.keys(), ...d.keys()])) {
    const sl = s.get(key);
    const dl = d.get(key);
    let line: CartLineInput | undefined;
    if (b) {
      const changedOnDevice = dl?.quantity !== b.get(key)?.quantity;
      line = changedOnDevice ? dl : sl;
    } else {
      line = sl && dl ? { ...dl, quantity: Math.max(sl.quantity, dl.quantity) } : (sl ?? dl);
    }
    if (line) result.push({ ...line, quantity: Math.min(Math.max(line.quantity, 1), policy.maxQuantityPerLine) });
  }
  return result;
}

export async function clearCustomerCart(customerId: string) {
  await prisma().cartItem.deleteMany({ where: { customerId } });
}
