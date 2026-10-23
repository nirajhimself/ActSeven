"use client";

import { findProduct, variantPrice, type Product } from "./catalog";
import { computeTotals } from "./pricing";
import { policy } from "./site";
import { createStore } from "./store";

export type CartLine = {
  id: string;
  slug: string;
  colour: string;
  size: string;
  quantity: number;
};

type CartState = { lines: CartLine[]; giftNote: string };

const isCartState = (v: unknown): v is CartState =>
  typeof v === "object" &&
  v !== null &&
  Array.isArray((v as CartState).lines) &&
  typeof (v as CartState).giftNote === "string";

const cart = createStore<CartState>({ lines: [], giftNote: "" }, { key: "act-vii:cart", validate: isCartState });
const drawer = createStore(false);

const clampQty = (n: number) => Math.max(1, Math.min(policy.maxQuantityPerLine, Math.round(n)));

export const useCart = cart.useValue;
export const useCartDrawerOpen = drawer.useValue;

export const cartDrawer = {
  open: () => drawer.set(() => true),
  close: () => drawer.set(() => false),
};

export function addToCart(item: Omit<CartLine, "id" | "quantity">, quantity = 1) {
  const id = `${item.slug}__${item.colour}__${item.size}`;
  cart.set((s) => {
    const existing = s.lines.find((l) => l.id === id);
    const lines = existing
      ? s.lines.map((l) => (l.id === id ? { ...l, quantity: clampQty(l.quantity + quantity) } : l))
      : [...s.lines, { ...item, id, quantity: clampQty(quantity) }];
    return { ...s, lines };
  });
}

export function setQuantity(id: string, quantity: number) {
  cart.set((s) => ({ ...s, lines: s.lines.map((l) => (l.id === id ? { ...l, quantity: clampQty(quantity) } : l)) }));
}

/** The most recently removed line, kept briefly so it can be restored. */
type Removed = { line: CartLine; index: number } | null;
const removed = createStore<Removed>(null);
let removedTimer: ReturnType<typeof setTimeout> | undefined;
export const useLastRemoved = removed.useValue;

export function dismissRemoved() {
  clearTimeout(removedTimer);
  removed.set(() => null);
}

export function removeLine(id: string) {
  const { lines } = cart.get();
  const index = lines.findIndex((l) => l.id === id);
  if (index < 0) return;
  cart.set((s) => ({ ...s, lines: s.lines.filter((l) => l.id !== id) }));
  clearTimeout(removedTimer);
  removed.set(() => ({ line: lines[index], index }));
  removedTimer = setTimeout(dismissRemoved, 8000);
}

/** Puts the last removed line back where it was (merging if it was re-added meanwhile). */
export function undoRemove() {
  const last = removed.get();
  if (!last) return;
  cart.set((s) => {
    if (s.lines.some((l) => l.id === last.line.id)) {
      return { ...s, lines: s.lines.map((l) => (l.id === last.line.id ? { ...l, quantity: clampQty(l.quantity + last.line.quantity) } : l)) };
    }
    const lines = [...s.lines];
    lines.splice(Math.min(last.index, lines.length), 0, last.line);
    return { ...s, lines };
  });
  dismissRemoved();
}

export function clearCart() {
  cart.set(() => ({ lines: [], giftNote: "" }));
  dismissRemoved();
}

export function setGiftNote(giftNote: string) {
  cart.set((s) => ({ ...s, giftNote: giftNote.slice(0, 200) }));
}

export type ResolvedLine = CartLine & { product: Product; unitPrice: number; lineTotal: number };

/**
 * Joins cart lines with the catalogue (from useCatalog), dropping lines whose product or size
 * no longer exists. Availability is not checked here: live stock is enforced
 * by the server at checkout, which explains any item that has sold out.
 */
export function resolveLines(lines: CartLine[], products: Product[]): ResolvedLine[] {
  return lines.flatMap((line) => {
    const product = findProduct(products, line.slug);
    if (!product || !product.sizes.includes(line.size)) return [];
    const unitPrice = variantPrice(product, line.colour, line.size);
    return [{ ...line, product, unitPrice, lineTotal: unitPrice * line.quantity }];
  });
}

export function cartTotals(lines: ResolvedLine[]) {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const { shipping, total } = computeTotals(subtotal);
  return { subtotal, count, shipping, total };
}
