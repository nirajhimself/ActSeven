"use client";

import type { ReactNode } from "react";
import { CheckIcon } from "@/components/ui/Icons";
import type { facetsFor, FilterState } from "@/lib/filters";

type Facets = ReturnType<typeof facetsFor>;
type ListKey = "category" | "size" | "colour" | "price" | "style";

type Props = {
  facets: Facets;
  state: FilterState;
  showCategory: boolean;
  onToggle: (key: ListKey, value: string) => void;
  onInStock: (value: boolean) => void;
};

function Group({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-obsidian/10 py-4">
      <summary className="label flex min-h-8 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="text-base leading-none transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <fieldset className="mt-3">
        <legend className="sr-only">{title}</legend>
        {children}
      </fieldset>
    </details>
  );
}

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="grid size-4 shrink-0 place-items-center border border-obsidian/40 peer-checked:border-obsidian peer-checked:bg-obsidian peer-checked:text-ivory peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2"
      >
        {checked ? <CheckIcon className="size-3" /> : null}
      </span>
      {children}
    </label>
  );
}

export function CollectionFilters({ facets, state, showCategory, onToggle, onInStock }: Props) {
  return (
    <div>
      {showCategory && facets.categories.length > 1 ? (
        <Group title="Category">
          {facets.categories.map((c) => (
            <CheckRow key={c.slug} checked={state.category.includes(c.slug)} onChange={() => onToggle("category", c.slug)}>
              {c.name}
            </CheckRow>
          ))}
        </Group>
      ) : null}

      <Group title="Size">
        <div className="flex flex-wrap gap-2">
          {facets.sizes.map((s) => (
            <label key={s} className="cursor-pointer">
              <input type="checkbox" checked={state.size.includes(s)} onChange={() => onToggle("size", s)} className="peer sr-only" />
              <span className="grid h-10 min-w-11 place-items-center border border-obsidian/20 px-2 text-xs peer-checked:border-obsidian peer-checked:bg-obsidian peer-checked:text-ivory peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 hover:border-obsidian">
                {s}
              </span>
            </label>
          ))}
        </div>
      </Group>

      <Group title="Colour">
        {facets.colours.map((c) => (
          <CheckRow key={c.name} checked={state.colour.includes(c.name)} onChange={() => onToggle("colour", c.name)}>
            <span aria-hidden="true" className="size-3.5 rounded-full ring-1 ring-obsidian/20" style={{ backgroundColor: c.hex }} />
            {c.name}
          </CheckRow>
        ))}
      </Group>

      <Group title="Price">
        {facets.prices.map((p) => (
          <CheckRow key={p.value} checked={state.price.includes(p.value)} onChange={() => onToggle("price", p.value)}>
            {p.label}
          </CheckRow>
        ))}
      </Group>

      <Group title="Style" defaultOpen={false}>
        {facets.styles.map((s) => (
          <CheckRow key={s.value} checked={state.style.includes(s.value)} onChange={() => onToggle("style", s.value)}>
            {s.label}
          </CheckRow>
        ))}
      </Group>

      <Group title="Availability">
        <CheckRow checked={state.inStock} onChange={() => onInStock(!state.inStock)}>
          In stock only <span className="text-xs text-taupe">(demo inventory)</span>
        </CheckRow>
      </Group>
    </div>
  );
}
