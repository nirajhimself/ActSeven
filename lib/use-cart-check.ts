"use client";

import { useEffect, useState } from "react";
import { checkCartAction } from "@/app/cart/actions";
import type { CartCheck } from "@/lib/server/cart";
import type { CartLine, ResolvedLine } from "./cart";
import type { PaymentMethod } from "./pricing";

/**
 * Checks the bag against live stock and prices on the server (debounced).
 * Returns null while a check is pending, for an empty bag, or if the check
 * couldn't run — callers then fall back to the catalogue's figures, and
 * checkout still validates everything on the server.
 */
export function useCartCheck(lines: CartLine[], method?: PaymentMethod, refresh = 0): CartCheck | null {
  const plain = lines.map(({ slug, colour, size, quantity }) => ({ slug, colour, size, quantity }));
  // `refresh` forces a new check (e.g. after the server reported a price change).
  const key = JSON.stringify([plain, method ?? null, refresh]);
  const [result, setResult] = useState<{ key: string; check: CartCheck | null } | null>(null);

  useEffect(() => {
    if (plain.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      checkCartAction(plain, method)
        .then((check) => !cancelled && setResult({ key, check }))
        .catch(() => !cancelled && setResult({ key, check: null }));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` captures lines and method.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return plain.length > 0 && result?.key === key ? result.check : null;
}

/** Bag lines priced with the live check's prices where it has them (the catalogue's otherwise). */
export function withLivePrices(lines: ResolvedLine[], check: CartCheck | null): ResolvedLine[] {
  if (!check) return lines;
  return lines.map((l) => {
    const price = check.lines.find((c) => c.slug === l.slug && c.colour === l.colour && c.size === l.size)?.unitPrice;
    return price != null && price !== l.unitPrice ? { ...l, unitPrice: price, lineTotal: price * l.quantity } : l;
  });
}

/** Shopper-facing note for a bag line, or null when it's fine. */
export function lineIssue(line: CartCheck["lines"][number] | undefined, shownPrice: number) {
  if (!line) return null;
  switch (line.status) {
    case "unavailable":
      return { blocking: true, text: "No longer available. Please remove it to continue." };
    case "sold-out":
      return { blocking: true, text: "Sold out in this colour and size. Please remove it to continue." };
    case "low":
      return { blocking: true, text: `Only ${line.available} left.`, fixTo: line.available };
    case "invalid-quantity":
      return { blocking: true, text: "Please check the quantity." };
    default:
      return line.unitPrice !== null && line.unitPrice !== shownPrice ? { blocking: false, text: `Price updated: now ₹${line.unitPrice.toLocaleString("en-IN")} each.` } : null;
  }
}
