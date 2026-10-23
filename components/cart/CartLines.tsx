"use client";

import Image from "next/image";
import Link from "next/link";
import { MinusIcon, PlusIcon, TrashIcon } from "@/components/ui/Icons";
import { removeLine, setQuantity, undoRemove, useLastRemoved, type ResolvedLine } from "@/lib/cart";
import type { CartCheck } from "@/lib/server/cart";
import { lineIssue } from "@/lib/use-cart-check";
import { useCatalog } from "@/components/catalog/CatalogProvider";
import { findProduct, variantPrice } from "@/lib/catalog";
import { formatINR } from "@/lib/format";
import { policy } from "@/lib/site";

// 36px on mouse/trackpad, 44px on touch screens.
const iconButton = "grid place-items-center disabled:opacity-30 pointer-coarse:size-11";

export function QuantityStepper({ line, compact = false }: { line: ResolvedLine; compact?: boolean }) {
  const label = `${line.product.name}, ${line.colour}, size ${line.size}`;
  const btn = `${iconButton} ${compact ? "size-9" : "size-11"}`;
  return (
    <div className="inline-flex items-center border border-obsidian/15" role="group" aria-label={`Quantity for ${label}`}>
      <button
        type="button"
        className={btn}
        aria-label={`Decrease quantity of ${label}`}
        disabled={line.quantity <= 1}
        onClick={() => setQuantity(line.id, line.quantity - 1)}
      >
        <MinusIcon className="size-3.5" />
      </button>
      <span className="min-w-6 text-center text-xs tabular-nums" aria-live="polite" aria-atomic="true">
        <span className="sr-only">Quantity </span>
        {line.quantity}
      </span>
      <button
        type="button"
        className={btn}
        aria-label={`Increase quantity of ${label}`}
        disabled={line.quantity >= policy.maxQuantityPerLine}
        onClick={() => setQuantity(line.id, line.quantity + 1)}
      >
        <PlusIcon className="size-3.5" />
      </button>
    </div>
  );
}

/** "Removed … Undo" bar shown for a few seconds after a line is removed. */
export function RemovedNotice() {
  const last = useLastRemoved();
  const { products } = useCatalog();
  const product = last ? findProduct(products, last.line.slug) : undefined;
  return (
    <div role="status" aria-live="polite">
      {last && product ? (
        <div className="mt-4 flex items-center justify-between gap-3 bg-obsidian px-4 py-2.5 text-xs text-ivory">
          <span className="min-w-0">
            Removed {product.name}{" "}
            <span className="text-ivory/70">
              ({last.line.colour} / {last.line.size})
            </span>
          </span>
          <button type="button" onClick={undoRemove} className="label shrink-0 py-2 text-gold underline-offset-4 hover:underline">
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CartLines({
  lines,
  onNavigate,
  size = "drawer",
  check = null,
}: {
  lines: ResolvedLine[];
  onNavigate?: () => void;
  size?: "drawer" | "page";
  /** Live server check of the bag (stock and current prices), when available. */
  check?: CartCheck | null;
}) {
  const page = size === "page";
  return (
    <ul className="divide-y divide-obsidian/10">
      {lines.map((line, i) => {
        const image = line.product.images[0];
        const href = `/products/${line.product.slug}`;
        const hex = line.product.colours.find((c) => c.name === line.colour)?.hex;
        const atLimit = line.quantity >= policy.maxQuantityPerLine;
        return (
          <li key={line.id} className={`grid gap-4 py-5 ${page ? "grid-cols-[6rem_1fr] sm:grid-cols-[8rem_1fr]" : "grid-cols-[4.5rem_1fr]"}`}>
            <Link href={href} onClick={onNavigate} className="relative block aspect-[4/5] overflow-hidden bg-bone" tabIndex={-1} aria-hidden="true">
              <Image
                src={image.src}
                alt=""
                fill
                sizes={page ? "8rem" : "4.5rem"}
                loading={page && i === 0 ? "eager" : "lazy"}
                className="photo-grade object-cover"
                style={{ objectPosition: image.position }}
              />
            </Link>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={href} onClick={onNavigate} className={`hover:underline underline-offset-4 ${page ? "display text-xl" : "text-sm"}`}>
                    {line.product.name}
                  </Link>
                  <dl className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-taupe">
                    <div className="flex items-center gap-1.5">
                      <dt className="sr-only">Colour</dt>
                      {hex ? <span aria-hidden="true" className="size-3 rounded-full ring-1 ring-obsidian/20" style={{ backgroundColor: hex }} /> : null}
                      <dd>{line.colour}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Size</dt>
                      <dd className="text-obsidian">{line.size}</dd>
                    </div>
                    {!page && line.quantity > 1 ? (
                      <div>
                        <dt className="sr-only">Price each</dt>
                        <dd>{formatINR(line.unitPrice)} each</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
                {page ? <p className="text-sm tabular-nums">{formatINR(line.lineTotal)}</p> : null}
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                {page ? (
                  <p className="text-xs whitespace-nowrap text-taupe">{formatINR(line.unitPrice)} each</p>
                ) : (
                  <p className="text-sm tabular-nums">{formatINR(line.lineTotal)}</p>
                )}
                <div className="flex items-center gap-1">
                  <QuantityStepper line={line} compact={!page} />
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className={`${iconButton} size-10 text-taupe hover:text-obsidian`}
                    aria-label={`Remove ${line.product.name}, ${line.colour}, size ${line.size}`}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </div>
              {atLimit ? <p className="mt-2 text-right text-[0.6875rem] text-taupe">Limit {policy.maxQuantityPerLine} per order</p> : null}
              <LineIssue line={line} check={check} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Stock / price note under a bag line, from the live server check. */
export function LineIssue({ line, check }: { line: ResolvedLine; check: CartCheck | null }) {
  // Compare with the catalogue price the shopper first saw, so a change is called out.
  const issue = lineIssue(
    check?.lines.find((l) => l.slug === line.slug && l.colour === line.colour && l.size === line.size),
    variantPrice(line.product, line.colour, line.size),
  );
  if (!issue) return null;
  return (
    <p role={issue.blocking ? "alert" : undefined} className={`mt-2 text-[0.6875rem] ${issue.blocking ? "text-[#9b2c1f]" : "text-gold-deep"}`}>
      {issue.text}
      {"fixTo" in issue && issue.fixTo ? (
        <button type="button" onClick={() => setQuantity(line.id, issue.fixTo)} className="ml-2 underline underline-offset-2">
          Change to {issue.fixTo}
        </button>
      ) : null}
    </p>
  );
}
