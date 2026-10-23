"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import type { TestOrderReceipt as Receipt } from "@/app/checkout/actions";
import { Monogram } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import { TEST_RECEIPT_KEY } from "./CheckoutForm";

const noopSubscribe = () => () => {};
const readReceipt = () => {
  try {
    return sessionStorage.getItem(TEST_RECEIPT_KEY) ?? "";
  } catch {
    return "";
  }
};

function parse(raw: string | null): Receipt | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Receipt;
    return r && typeof r.reference === "string" && Array.isArray(r.items) ? r : null;
  } catch {
    return null;
  }
}

/** Confirmation for a simulated order. Everything here says "test" — it must never read as a real purchase. */
export function TestOrderReceipt() {
  // null on the server / during hydration, the stored string afterwards.
  const raw = useSyncExternalStore(noopSubscribe, readReceipt, () => null);
  const receipt = useMemo(() => parse(raw), [raw]);

  if (raw === null) return <div aria-busy="true" aria-label="Loading test order" className="h-96 animate-pulse bg-bone/60" />;

  if (!receipt) {
    return (
      <div className="py-16 text-center">
        <p className="display text-4xl">No test order to show.</p>
        <p className="mx-auto mt-4 max-w-md text-sm text-taupe">
          Test receipts are kept only in this browser tab. Place a test order from your bag to see one here.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href="/cart">Go to bag</ButtonLink>
        </div>
      </div>
    );
  }

  const placed = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(
    new Date(receipt.placedAt),
  );
  const d = receipt.delivery;

  return (
    <>
      <div role="note" className="border-2 border-dashed border-gold-deep/70 bg-gold/10 px-4 py-4 text-center text-sm leading-relaxed">
        <p className="label text-gold-deep">Test order — not a real purchase</p>
        <p className="mt-1.5 text-graphite">No payment was taken, nothing was saved, no email was sent and nothing will be shipped.</p>
      </div>

      <div className="mt-12 text-center">
        <Monogram className="mx-auto h-10 w-auto text-taupe" />
        <p className="eyebrow mt-8">Test checkout complete</p>
        <h1 className="display mt-4 text-4xl sm:text-5xl">Your test order went through.</h1>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-graphite">
          Every step worked: your details were checked and the prices were confirmed on the server. When the store is connected,
          this is where a real order confirmation will appear.
        </p>
        <p className="mt-6 text-xs tracking-[0.12em] text-taupe">
          {receipt.reference} · {placed}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/collections/all">Continue shopping</ButtonLink>
        </div>
      </div>

      <div className="mt-14 grid gap-10 border-t border-obsidian/10 pt-10 md:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="test-items">
          <h2 id="test-items" className="display text-2xl">
            Items
          </h2>
          <ul className="mt-4 divide-y divide-obsidian/10">
            {receipt.items.map((item) => (
              <li key={`${item.slug}-${item.colour}-${item.size}`} className="flex justify-between gap-4 py-3 text-sm">
                <div>
                  <Link href={`/products/${item.slug}`} className="underline-offset-4 hover:underline">
                    {item.name}
                  </Link>
                  <p className="text-xs text-taupe">
                    {item.colour} / {item.size} · Qty {item.quantity} · {formatINR(item.unitPrice)} each
                  </p>
                </div>
                <p className="tabular-nums">{formatINR(item.unitPrice * item.quantity)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-obsidian/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatINR(receipt.totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd className="tabular-nums">{receipt.totals.shipping ? formatINR(receipt.totals.shipping) : "Complimentary"}</dd>
            </div>
            <div className="flex justify-between border-t border-obsidian/10 pt-3 font-medium">
              <dt>Total (not charged)</dt>
              <dd className="tabular-nums">{formatINR(receipt.totals.total)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="test-delivery" className="space-y-6 text-sm">
          <div>
            <h2 id="test-delivery" className="display text-2xl">
              Delivery details
            </h2>
            <address className="mt-4 leading-relaxed not-italic text-graphite">
              {d.name}
              <br />
              {d.address1}
              {d.address2 ? (
                <>
                  <br />
                  {d.address2}
                </>
              ) : null}
              <br />
              {d.city}, {d.state} {d.pincode}
              <br />
              {d.phone}
              <br />
              {receipt.email}
            </address>
          </div>
          {receipt.giftNote ? (
            <div>
              <h3 className="label">Gift note</h3>
              <p className="mt-2 text-graphite">“{receipt.giftNote}”</p>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
