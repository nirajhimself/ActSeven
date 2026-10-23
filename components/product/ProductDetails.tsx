"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { Product } from "@/lib/catalog";
import { formatINR } from "@/lib/format";
import { policy } from "@/lib/site";

/** WAI-ARIA tabs with arrow-key navigation. Stacks on small screens. */
export function ProductDetails({ product }: { product: Product }) {
  const base = useId();
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const panels = [
    {
      label: "Description",
      body: (
        <>
          <p>{product.description}</p>
          <ul className="mt-4 list-disc space-y-1.5 pl-5">
            {product.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </>
      ),
    },
    {
      label: "Fabric & Care",
      body: (
        <>
          <p>{product.fabric}</p>
          <ul className="mt-4 list-disc space-y-1.5 pl-5">
            {product.care.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      ),
    },
    { label: "Fit", body: <p>{product.fit}</p> },
    {
      label: "Shipping & Returns",
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Complimentary shipping across India on orders over {formatINR(policy.freeShippingThreshold)}; otherwise{" "}
            {formatINR(policy.standardShipping)}.
          </li>
          <li>Returns accepted within {policy.returnWindowDays} days of delivery on unworn pieces with tags attached.</li>
          <li>Delivery times are confirmed at checkout.</li>
          <li className="text-taupe">Placeholder policy for this demo store.</li>
        </ul>
      ),
    },
  ];

  const onKeyDown = (e: KeyboardEvent) => {
    const last = panels.length - 1;
    const next =
      e.key === "ArrowRight" ? (active === last ? 0 : active + 1)
      : e.key === "ArrowLeft" ? (active === 0 ? last : active - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Product information" onKeyDown={onKeyDown} className="no-scrollbar flex gap-6 overflow-x-auto border-b border-obsidian/10 md:gap-10">
        {panels.map((p, i) => (
          <button
            key={p.label}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            id={`${base}-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={active === i}
            aria-controls={`${base}-panel-${i}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            className={`-mb-px shrink-0 border-b py-4 text-xs whitespace-nowrap transition-colors ${
              active === i ? "border-obsidian text-obsidian" : "border-transparent text-taupe hover:text-obsidian"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <div
          key={p.label}
          id={`${base}-panel-${i}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${i}`}
          hidden={active !== i}
          tabIndex={0}
          className="max-w-2xl py-6 text-sm leading-relaxed text-graphite"
        >
          {p.body}
        </div>
      ))}
    </div>
  );
}
