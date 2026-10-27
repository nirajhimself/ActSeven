"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ArrowRightIcon, CloseIcon, SearchIcon } from "@/components/ui/Icons";
import { Sheet } from "@/components/ui/Sheet";
import { useCatalog } from "@/components/catalog/CatalogProvider";
import { searchProducts } from "@/lib/filters";
import { priceLabel } from "@/lib/catalog";

const suggestions = ["Oxford shirt", "Blazer", "Trouser", "Merino", "Tweed"];

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputId = useId();
  const { products, categories } = useCatalog();
  const results = query.trim().length >= 2 ? searchProducts(products, categories, query).slice(0, 6) : [];

  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} side="center" labelledBy="search-title" className="m-0 mb-auto w-full max-w-none">
      <div className="shell py-6 lg:py-10">
        <div className="flex items-center justify-between">
          <h2 id="search-title" className="eyebrow">
            Search ACT VII
          </h2>
          <button type="button" onClick={close} className="-mr-2.5 grid size-11 place-items-center" aria-label="Close search">
            <CloseIcon className="size-5" />
          </button>
        </div>

        <form
          role="search"
          className="mt-4 flex items-center gap-3 border-b border-obsidian/40 pb-3"
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            if (!q) return;
            close();
            router.push(`/collections/all?q=${encodeURIComponent(q)}`);
          }}
        >
          <SearchIcon className="size-5 shrink-0 text-taupe" />
          <label htmlFor={inputId} className="sr-only">
            Search products
          </label>
          <input
            id={inputId}
            type="search"
            autoFocus
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shirts, tailoring, knitwear…"
            className="display w-full bg-transparent py-1 text-2xl outline-none placeholder:text-taupe/70 lg:text-4xl"
          />
        </form>

        <div aria-live="polite" className="mt-6 min-h-24">
          {query.trim().length < 2 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow mr-2">Try</span>
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => setQuery(s)} className="border border-obsidian/20 px-3 py-2 text-xs hover:border-obsidian">
                  {s}
                </button>
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-taupe">No pieces match “{query.trim()}”.</p>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {results.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/products/${p.slug}`} onClick={close} className="group block">
                      <div className="relative aspect-[4/5] overflow-hidden bg-bone">
                        <Image
                          src={p.images[0].src}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 15vw, 45vw"
                          className="photo-grade object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                          style={{ objectPosition: p.images[0].position }}
                        />
                      </div>
                      <p className="mt-2 text-xs">{p.name}</p>
                      <p className="text-xs text-taupe">{priceLabel(p)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={`/collections/all?q=${encodeURIComponent(query.trim())}`}
                onClick={close}
                className="label mt-6 inline-flex items-center gap-2 py-2"
              >
                View all results <ArrowRightIcon className="size-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
