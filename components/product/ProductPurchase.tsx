"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MinusIcon, PlusIcon } from "@/components/ui/Icons";
import { addToCart, cartDrawer } from "@/lib/cart";
import { isSoldOut, sizeStatus, type Product, type StockLevels } from "@/lib/catalog";
import { policy } from "@/lib/site";
import { SizeGuide } from "./SizeGuide";
import { WishlistButton } from "./WishlistButton";

/**
 * `stock` is live inventory streamed from the server; until it arrives the
 * catalogue's (cached) stock is used. Availability is per colour and size.
 */
export function ProductPurchase({ product, stock = null }: { product: Product; stock?: StockLevels | null }) {
  const [colour, setColour] = useState(product.colours[0].name);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState(false);
  const [added, setAdded] = useState(false);
  const sizeGroupRef = useRef<HTMLFieldSetElement>(null);
  const ids = { colour: useId(), size: useId(), error: useId(), qty: useId() };

  const soldOut = isSoldOut(product, stock);
  const status = size ? sizeStatus(product, size, colour, stock) : null;

  const submit = () => {
    if (!size) {
      setError(true);
      sizeGroupRef.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
      return;
    }
    if (status === "sold-out") return;
    addToCart({ slug: product.slug, colour, size }, quantity);
    setAdded(true);
    cartDrawer.open();
  };

  return (
    <div className="space-y-7">
      {/* Colour */}
      <fieldset>
        <legend className="text-xs">
          Colour: <span className="text-taupe">{colour}</span>
        </legend>
        <div className="mt-3 flex flex-wrap gap-3">
          {product.colours.map((c) => (
            <label key={c.name} className="cursor-pointer" title={c.name}>
              <input
                type="radio"
                name={ids.colour}
                value={c.name}
                checked={colour === c.name}
                onChange={() => setColour(c.name)}
                className="peer sr-only"
              />
              <span className="sr-only">{c.name}</span>
              <span
                aria-hidden="true"
                className="block size-8 rounded-full ring-1 ring-obsidian/20 ring-offset-2 ring-offset-ivory peer-checked:ring-obsidian peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-4"
                style={{ backgroundColor: c.hex }}
              />
            </label>
          ))}
        </div>
        {product.colours.length > 1 ? (
          <p className="mt-2 text-[0.6875rem] text-taupe">Photography shows one colourway.</p>
        ) : null}
      </fieldset>

      {/* Size */}
      <fieldset ref={sizeGroupRef} aria-describedby={error ? ids.error : undefined}>
        <div className="flex items-center justify-between">
          <legend className="text-xs">
            Size{size ? <span className="text-taupe">: {size}</span> : null}
          </legend>
          <SizeGuide category={product.category} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {product.sizes.map((s) => {
            const st = sizeStatus(product, s, colour, stock);
            return (
              <label key={s} className={st === "sold-out" ? "cursor-not-allowed" : "cursor-pointer"}>
                <input
                  type="radio"
                  name={ids.size}
                  value={s}
                  checked={size === s}
                  disabled={st === "sold-out"}
                  onChange={() => {
                    setSize(s);
                    setError(false);
                    setAdded(false);
                  }}
                  className="peer sr-only"
                />
                <span
                  className={`grid h-11 min-w-12 place-items-center border px-3 text-xs transition-colors peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 ${
                    st === "sold-out"
                      ? "border-obsidian/10 text-taupe/60 line-through"
                      : "border-obsidian/20 hover:border-obsidian peer-checked:border-obsidian peer-checked:bg-obsidian peer-checked:text-ivory"
                  }`}
                >
                  {s}
                  {st === "sold-out" ? <span className="sr-only"> (sold out)</span> : null}
                </span>
              </label>
            );
          })}
        </div>
        <p id={ids.error} role="alert" className="mt-2 min-h-4 text-xs text-[#9b2c1f]">
          {error ? "Please select a size." : ""}
        </p>
      </fieldset>

      {/* Quantity + stock state */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span id={ids.qty} className="text-xs">
            Quantity
          </span>
          <div className="inline-flex items-center border border-obsidian/15" role="group" aria-labelledby={ids.qty}>
            <button type="button" className="grid size-11 place-items-center disabled:opacity-30" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((q) => q - 1)}>
              <MinusIcon className="size-3.5" />
            </button>
            <output aria-live="polite" className="min-w-6 text-center text-sm tabular-nums">
              {quantity}
            </output>
            <button
              type="button"
              className="grid size-11 place-items-center disabled:opacity-30"
              aria-label="Increase quantity"
              disabled={quantity >= policy.maxQuantityPerLine}
              onClick={() => setQuantity((q) => q + 1)}
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>
        </div>
        <p className="text-xs" aria-live="polite">
          {soldOut ? (
            <span className="text-taupe">Sold out</span>
          ) : status === "sold-out" ? (
            <span className="text-taupe">
              {size} is sold out in {colour}
            </span>
          ) : status === "low" ? (
            <span className="text-gold-deep">Only a few left in {size}</span>
          ) : status === "available" ? (
            <span>In stock</span>
          ) : (
            <span className="text-taupe">Select a size to check stock</span>
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={submit} disabled={soldOut || status === "sold-out"} arrow={!soldOut} className="flex-1">
          {soldOut ? "Sold out" : "Add to bag"}
        </Button>
        <WishlistButton slug={product.slug} name={product.name} bordered className="size-12" />
      </div>
      <p className="sr-only" aria-live="polite">
        {added ? `${product.name} added to bag.` : ""}
      </p>
    </div>
  );
}
