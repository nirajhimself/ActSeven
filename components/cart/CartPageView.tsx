"use client";

import { useMemo } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { cartTotals, resolveLines, useCart } from "@/lib/cart";
import { formatINR } from "@/lib/format";
import { useHydrated } from "@/lib/store";
import { useCatalog } from "@/components/catalog/CatalogProvider";
import { CartLines, RemovedNotice } from "./CartLines";
import { GiftNote, TestCheckoutNote, TotalsTable } from "./CartSummary";

export function CartPageView({ testCheckout = false }: { testCheckout?: boolean }) {
  const hydrated = useHydrated();
  const { lines, giftNote } = useCart();
  const { products } = useCatalog();
  const resolved = useMemo(() => resolveLines(lines, products), [lines, products]);
  const totals = cartTotals(resolved);
  const checkoutLabel = testCheckout ? "Test checkout" : "Checkout";

  // The bag lives in localStorage: wait for it rather than flashing "empty".
  if (!hydrated) {
    return <div aria-busy="true" aria-label="Loading your bag" className="h-80 animate-pulse bg-bone/60" />;
  }

  if (resolved.length === 0) {
    return (
      <div className="flex flex-col items-start gap-6 pb-16">
        <div className="w-full max-w-md">
          <RemovedNotice />
        </div>
        <p className="display mt-10 text-4xl">Your bag is empty.</p>
        <p className="max-w-sm text-sm text-taupe">Easy, considered pieces for every day. Start with the essentials.</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/collections/all">Shop the collection</ButtonLink>
          <ButtonLink href="/collections/new-arrivals" variant="outline" arrow={false}>
            New arrivals
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-10 pb-24 lg:grid-cols-[1fr_24rem] lg:gap-16 lg:pb-0">
        <section aria-labelledby="bag-items-title">
          <h2 id="bag-items-title" className="sr-only">
            Items
          </h2>
          <RemovedNotice />
          <div className="mt-4 border-t border-obsidian/10">
            <CartLines lines={resolved} size="page" />
          </div>
        </section>

        <aside aria-labelledby="summary-title" className="space-y-6 lg:sticky lg:top-32 lg:self-start">
          <h2 id="summary-title" className="display text-2xl">
            Order summary
          </h2>
          <TotalsTable totals={totals} />
          <GiftNote value={giftNote} />
          <ButtonLink href="/checkout" className="w-full">
            {checkoutLabel}
          </ButtonLink>
          {testCheckout ? <TestCheckoutNote /> : null}
          <ButtonLink href="/collections/all" variant="outline" arrow={false} className="w-full">
            Continue shopping
          </ButtonLink>
        </aside>
      </div>

      {/* Phones: keep the total and checkout in reach while scrolling a long bag. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-obsidian/10 bg-ivory/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="flex items-center gap-4">
          <p className="text-sm">
            <span className="block text-[0.6875rem] text-taupe">Estimated total</span>
            <span className="font-medium tabular-nums">{formatINR(totals.total)}</span>
          </p>
          <ButtonLink href="/checkout" className="flex-1">
            {checkoutLabel}
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
