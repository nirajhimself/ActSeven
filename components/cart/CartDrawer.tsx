"use client";

import { useMemo } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/Icons";
import { Sheet } from "@/components/ui/Sheet";
import { cartDrawer, cartTotals, resolveLines, useCart, useCartDrawerOpen } from "@/lib/cart";
import { useCatalog } from "@/components/catalog/CatalogProvider";
import { CartLines, RemovedNotice } from "./CartLines";
import { GiftNote, TestCheckoutNote, TotalsTable } from "./CartSummary";

export function CartDrawer({ testCheckout = false }: { testCheckout?: boolean }) {
  const open = useCartDrawerOpen();
  const { lines, giftNote } = useCart();
  const { products } = useCatalog();
  const resolved = useMemo(() => resolveLines(lines, products), [lines, products]);
  const totals = cartTotals(resolved);

  return (
    <Sheet open={open} onClose={cartDrawer.close} side="right" labelledBy="cart-title">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-obsidian/10 px-6 py-3">
          <h2 id="cart-title" className="display text-2xl">
            Your Bag <span className="text-taupe">({totals.count})</span>
          </h2>
          <button type="button" onClick={cartDrawer.close} className="-mr-2.5 grid size-11 place-items-center" aria-label="Close bag">
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="px-6">
          <RemovedNotice />
        </div>

        {resolved.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
            <p className="display text-3xl">Your bag is empty.</p>
            <p className="max-w-xs text-sm text-taupe">Considered pieces, made to last. Start with the essentials.</p>
            <ButtonLink href="/collections/all" onClick={cartDrawer.close}>
              Shop the collection
            </ButtonLink>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6">
              <CartLines lines={resolved} onNavigate={cartDrawer.close} />
              <div className="pb-6">
                <GiftNote value={giftNote} />
              </div>
            </div>
            <div className="space-y-4 border-t border-obsidian/10 px-6 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <TotalsTable totals={totals} compact />
              <div className="grid grid-cols-[3fr_2fr] gap-3">
                <ButtonLink href="/checkout" onClick={cartDrawer.close} className="w-full px-3">
                  {testCheckout ? "Test checkout" : "Checkout"}
                </ButtonLink>
                <ButtonLink href="/cart" variant="outline" arrow={false} onClick={cartDrawer.close} className="w-full px-3">
                  View bag
                </ButtonLink>
              </div>
              {testCheckout ? <TestCheckoutNote /> : null}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
