"use client";

import { useEffect, useSyncExternalStore } from "react";
import { variantPrice, type Product } from "@/lib/catalog";
import { formatINR } from "@/lib/format";

type Selection = { colour: string; size: string | null };

// The colour and size chosen in ProductPurchase, per product, so the price
// shown above it can follow a variant that has its own price.
const selections = new Map<string, Selection>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by ProductPurchase whenever its colour or size changes. */
export function usePublishSelection(slug: string, colour: string, size: string | null) {
  useEffect(() => {
    selections.set(slug, { colour, size });
    listeners.forEach((l) => l());
    return () => {
      selections.delete(slug);
      listeners.forEach((l) => l());
    };
  }, [slug, colour, size]);
}

/** The product price, or the chosen colour/size's own price once a size is picked. */
export function ProductPrice({ product }: { product: Product }) {
  const selection = useSyncExternalStore(
    subscribe,
    () => selections.get(product.slug),
    () => undefined,
  );
  const price = selection?.size ? variantPrice(product, selection.colour, selection.size) : product.price;
  return <>{formatINR(price)}</>;
}
