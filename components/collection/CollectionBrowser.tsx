"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { ProductGrid } from "@/components/product/ProductGrid";
import { Button } from "@/components/ui/Button";
import { CloseIcon, FilterIcon } from "@/components/ui/Icons";
import { Sheet } from "@/components/ui/Sheet";
import { useCatalog } from "@/components/catalog/CatalogProvider";
import { findProduct, type Product } from "@/lib/catalog";
import {
  activeFilterCount,
  applyFilters,
  facetsFor,
  parseFilters,
  priceBands,
  sortOptions,
  styleOptions,
  type SortKey,
} from "@/lib/filters";
import { CollectionFilters } from "./CollectionFilters";

type ListKey = "category" | "size" | "colour" | "price" | "style";

export function CollectionBrowser({ slugs, showCategory }: { slugs: string[]; showCategory: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sortId = useId();

  const { products, categories } = useCatalog();
  const base = useMemo(
    () => slugs.map((s) => findProduct(products, s)).filter((p): p is Product => Boolean(p)),
    [slugs, products],
  );
  const facets = useMemo(() => facetsFor(base, categories), [base, categories]);
  const state = parseFilters(searchParams);
  const results = applyFilters(base, state, categories);
  const activeCount = activeFilterCount(state);

  const update = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toggle = (key: ListKey, value: string) =>
    update((p) => {
      const current = state[key];
      const nextList = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      if (nextList.length) p.set(key, nextList.join(","));
      else p.delete(key);
    });

  const setInStock = (on: boolean) => update((p) => (on ? p.set("availability", "in-stock") : p.delete("availability")));
  const setSort = (sort: SortKey) => update((p) => (sort === "featured" ? p.delete("sort") : p.set("sort", sort)));
  const clearAll = () =>
    update((p) => {
      for (const k of ["category", "size", "colour", "price", "style", "availability", "q"]) p.delete(k);
    });

  // Chips describing every active filter, each removable.
  const chips: { label: string; remove: () => void }[] = [
    ...(state.q ? [{ label: `“${state.q}”`, remove: () => update((p) => p.delete("q")) }] : []),
    ...state.category.map((v) => ({ label: facets.categories.find((c) => c.slug === v)?.name ?? v, remove: () => toggle("category", v) })),
    ...state.size.map((v) => ({ label: `Size ${v}`, remove: () => toggle("size", v) })),
    ...state.colour.map((v) => ({ label: v, remove: () => toggle("colour", v) })),
    ...state.price.map((v) => ({ label: priceBands.find((b) => b.value === v)?.label ?? v, remove: () => toggle("price", v) })),
    ...state.style.map((v) => ({ label: styleOptions.find((s) => s.value === v)?.label ?? v, remove: () => toggle("style", v) })),
    ...(state.inStock ? [{ label: "In stock", remove: () => setInStock(false) }] : []),
  ];

  const filterPanel = (
    <CollectionFilters facets={facets} state={state} showCategory={showCategory} onToggle={toggle} onInStock={setInStock} />
  );

  return (
    <div className="shell py-8 lg:py-10">
      {/* Toolbar: style pills, count, filter trigger, sort */}
      <div className="flex flex-col gap-4 border-b border-obsidian/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto px-5 md:mx-0 md:px-0" role="group" aria-label="Quick style filter">
          <button
            type="button"
            aria-pressed={state.style.length === 0}
            onClick={() => update((p) => p.delete("style"))}
            className="label shrink-0 px-3 py-2.5 text-taupe aria-pressed:text-obsidian aria-pressed:underline aria-pressed:underline-offset-8"
          >
            All
          </button>
          {facets.styles.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={state.style.includes(s.value)}
              onClick={() => toggle("style", s.value)}
              className="label shrink-0 px-3 py-2.5 text-taupe hover:text-obsidian aria-pressed:text-obsidian aria-pressed:underline aria-pressed:underline-offset-8"
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <p className="text-xs text-taupe" aria-live="polite">
            {results.length} {results.length === 1 ? "piece" : "pieces"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              className="label flex min-h-11 items-center gap-2 px-2 lg:hidden"
            >
              <FilterIcon className="size-4" />
              Filter{activeCount ? ` (${activeCount})` : ""}
            </button>
            <label htmlFor={sortId} className="label text-taupe">
              Sort
            </label>
            <select
              id={sortId}
              value={state.sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="min-h-11 cursor-pointer bg-transparent pr-1 text-xs outline-offset-2"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {chips.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.remove}
              aria-label={`Remove filter: ${chip.label}`}
              className="flex min-h-9 items-center gap-2 border border-obsidian/20 px-3 text-xs hover:border-obsidian"
            >
              {chip.label}
              <CloseIcon className="size-3" />
            </button>
          ))}
          <button type="button" onClick={clearAll} className="min-h-9 px-2 text-xs underline underline-offset-4">
            Clear all
          </button>
        </div>
      ) : null}

      <div className="mt-6 grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-12">
        <aside aria-label="Filters" className="hidden lg:block">
          {filterPanel}
        </aside>

        {results.length ? (
          <ProductGrid products={results} columns={3} eagerCount={2} />
        ) : (
          <div className="flex flex-col items-start gap-5 py-16">
            <p className="display text-3xl">Nothing matches those filters.</p>
            <p className="text-sm text-taupe">Try removing a filter or two.</p>
            <Button variant="outline" onClick={clearAll}>
              Clear all filters
            </Button>
          </div>
        )}
      </div>

      {/* Mobile / tablet filter drawer */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} side="left" labelledBy="filters-title">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-obsidian/10 px-5 py-3">
            <h2 id="filters-title" className="display text-2xl">
              Filter
            </h2>
            <button type="button" onClick={() => setFiltersOpen(false)} className="-mr-2.5 grid size-11 place-items-center" aria-label="Close filters">
              <CloseIcon className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5">{filterPanel}</div>
          <div className="grid grid-cols-2 gap-3 border-t border-obsidian/10 p-5">
            <Button variant="outline" onClick={clearAll} disabled={!activeCount && !state.q}>
              Clear
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Show {results.length}</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
