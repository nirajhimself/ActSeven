import { isSoldOut, priceRange, sizeStatus, type Category, type Product, type Style } from "./catalog";

export type SortKey = "featured" | "newest" | "price-asc" | "price-desc";

export const sortOptions: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

export const priceBands = [
  { value: "under-3000", label: "Under ₹3,000", min: 0, max: 2999 },
  { value: "3000-7500", label: "₹3,000 – ₹7,500", min: 3000, max: 7500 },
  { value: "7500-15000", label: "₹7,500 – ₹15,000", min: 7501, max: 15000 },
  { value: "over-15000", label: "Over ₹15,000", min: 15001, max: Infinity },
] as const;

export const styleOptions: { value: Style; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "tailored", label: "Tailored" },
  { value: "relaxed", label: "Relaxed" },
];

export type FilterState = {
  category: string[];
  size: string[];
  colour: string[];
  price: string[];
  style: string[];
  inStock: boolean;
  sort: SortKey;
  q: string;
};

type Params = { get(name: string): string | null };

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function parseFilters(params: Params): FilterState {
  const sort = params.get("sort") as SortKey | null;
  return {
    category: list(params.get("category")),
    size: list(params.get("size")),
    colour: list(params.get("colour")),
    price: list(params.get("price")),
    style: list(params.get("style")),
    inStock: params.get("availability") === "in-stock",
    sort: sortOptions.some((o) => o.value === sort) ? sort! : "featured",
    q: params.get("q")?.trim() ?? "",
  };
}

export function activeFilterCount(f: FilterState) {
  return f.category.length + f.size.length + f.colour.length + f.price.length + f.style.length + (f.inStock ? 1 : 0);
}

function matchesQuery(p: Product, q: string, categories: Category[]) {
  const category = categories.find((c) => c.slug === p.category)?.name ?? "";
  const haystack = [p.name, category, p.summary, p.fabric, ...p.colours.map((c) => c.name), ...p.styles]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term.replace(/s$/, "")));
}

export function searchProducts(products: Product[], categories: Category[], q: string) {
  return products.filter((p) => matchesQuery(p, q, categories));
}

export function applyFilters(items: Product[], f: FilterState, categories: Category[]) {
  const filtered = items.filter((p) => {
    if (f.q && !matchesQuery(p, f.q, categories)) return false;
    if (f.category.length && !f.category.includes(p.category)) return false;
    if (f.size.length && !f.size.some((s) => p.sizes.includes(s) && sizeStatus(p, s) !== "sold-out")) return false;
    if (f.colour.length && !p.colours.some((c) => f.colour.includes(c.name))) return false;
    if (f.style.length && !p.styles.some((s) => f.style.includes(s))) return false;
    if (f.price.length) {
      const bands = priceBands.filter((b) => f.price.includes(b.value));
      const from = priceRange(p).min;
      if (!bands.some((b) => from >= b.min && from <= b.max)) return false;
    }
    if (f.inStock && isSoldOut(p)) return false;
    return true;
  });

  switch (f.sort) {
    case "newest":
      return [...filtered].sort((a, b) => b.addedOn.localeCompare(a.addedOn));
    case "price-asc":
      return [...filtered].sort((a, b) => priceRange(a).min - priceRange(b).min);
    case "price-desc":
      return [...filtered].sort((a, b) => priceRange(b).min - priceRange(a).min);
    default:
      return filtered;
  }
}

/** Facet values present in a set of products, so filters never offer dead ends. */
export function facetsFor(items: Product[], categories: Category[]) {
  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL"];
  const sizes = [...new Set(items.flatMap((p) => p.sizes))].sort((a, b) => {
    const ai = sizeOrder.indexOf(a);
    const bi = sizeOrder.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return Number(a) - Number(b);
  });
  const colourMap = new Map(items.flatMap((p) => p.colours).map((c) => [c.name, c]));
  return {
    categories: categories.filter((c) => items.some((p) => p.category === c.slug)),
    sizes,
    colours: [...colourMap.values()],
    prices: priceBands.filter((b) => items.some((p) => priceRange(p).min >= b.min && priceRange(p).min <= b.max)),
    styles: styleOptions.filter((s) => items.some((p) => p.styles.includes(s.value))),
  };
}
