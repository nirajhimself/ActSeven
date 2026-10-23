"use client";

import { useId } from "react";
import { setGiftNote, type cartTotals } from "@/lib/cart";
import { formatINR } from "@/lib/format";
import { policy } from "@/lib/site";

type Totals = ReturnType<typeof cartTotals>;

export function GiftNote({ value }: { value: string }) {
  const id = useId();
  return (
    <div className="bg-bone/70 p-4">
      <label htmlFor={id} className="text-xs">
        Add a gift note <span className="text-taupe">(optional)</span>
      </label>
      <textarea
        id={id}
        rows={2}
        maxLength={200}
        value={value}
        onChange={(e) => setGiftNote(e.target.value)}
        className="mt-2 block w-full resize-none bg-transparent text-sm outline-none placeholder:text-taupe/70"
        placeholder="Write a short message…"
      />
    </div>
  );
}

/** `compact` drops the GST/shipping footnote (used in the drawer, where height is tight on phones). */
export function TotalsTable({ totals, compact = false }: { totals: Totals; compact?: boolean }) {
  const remaining = policy.freeShippingThreshold - totals.subtotal;
  return (
    <div className="space-y-3 text-sm">
      <dl className="space-y-3">
        <div className="flex justify-between">
          <dt>
            Subtotal <span className="text-taupe">({totals.count} {totals.count === 1 ? "item" : "items"})</span>
          </dt>
          <dd className="tabular-nums">{formatINR(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Shipping (estimate)</dt>
          <dd className="text-right tabular-nums">{totals.shipping === 0 ? "Complimentary" : formatINR(totals.shipping)}</dd>
        </div>
        <div className="flex justify-between border-t border-obsidian/10 pt-3">
          <dt className="font-medium">Estimated total</dt>
          <dd className="font-medium tabular-nums">{formatINR(totals.total)}</dd>
        </div>
      </dl>
      {remaining > 0 ? (
        <p className="text-xs text-taupe">Add {formatINR(remaining)} more for complimentary shipping.</p>
      ) : null}
      {compact ? null : <p className="text-xs text-taupe">Prices include GST. Final shipping is confirmed at checkout.</p>}
    </div>
  );
}

/** Shown beside checkout buttons while orders run in test mode (local sample database). */
export function TestCheckoutNote({ className = "" }: { className?: string }) {
  return (
    <p className={`border border-dashed border-gold-deep/60 px-3 py-2 text-[0.6875rem] leading-relaxed text-graphite ${className}`}>
      <strong className="label mr-1.5 text-gold-deep">Test checkout</strong>
      Ordering isn&apos;t live yet — no payment is taken and nothing is shipped.
    </p>
  );
}
