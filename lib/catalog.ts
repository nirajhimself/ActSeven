import type { Photo } from "./photos";

/**
 * Catalogue types and pure helpers, shared by server and client code. The
 * data itself lives in the database (see prisma/schema.prisma): server code
 * reads it with getCatalog() from lib/server/catalog.ts, client components
 * with useCatalog() from components/catalog/CatalogProvider.tsx.
 */

export type Style = "formal" | "casual" | "tailored" | "relaxed";

export type Colour = { name: string; hex: string };

export type Category = {
  slug: string;
  name: string;
  tagline: string;
  image: Photo;
};

/** One colour and size of a product, with its stock. */
export type Variant = {
  sku: string;
  colour: string;
  size: string;
  /** Whole rupees, tax inclusive (the product price unless overridden). */
  price: number;
  stock: number;
  lowStockThreshold: number;
};

export type Product = {
  slug: string;
  name: string;
  category: string;
  /** Base price in whole rupees, tax inclusive. */
  price: number;
  colours: Colour[];
  /** In size-chart order. */
  sizes: string[];
  images: Photo[];
  summary: string;
  description: string;
  highlights: string[];
  fabric: string;
  fit: string;
  care: string[];
  styles: Style[];
  isNew: boolean;
  campaigns: string[];
  /** ISO date, used for the "Newest" sort. */
  addedOn: string;
  variants: Variant[];
};

export type Catalog = { products: Product[]; categories: Category[] };

/** Stock for one product: `${colour}|${size}` → units. */
export type StockLevels = Record<string, number>;

export type SizeStatus = "available" | "low" | "sold-out";

export const variantKey = (colour: string, size: string) => `${colour}|${size}`;

export function findProduct(products: Product[], slug: string) {
  return products.find((p) => p.slug === slug);
}

export function findCategory(categories: Category[], slug: string) {
  return categories.find((c) => c.slug === slug);
}

export function getVariant(product: Product, colour: string, size: string) {
  return product.variants.find((v) => v.colour === colour && v.size === size);
}

/** The price for a colour/size, falling back to the product price. */
export function variantPrice(product: Product, colour: string, size: string) {
  return getVariant(product, colour, size)?.price ?? product.price;
}

function statusOf(units: number, threshold: number): SizeStatus {
  return units <= 0 ? "sold-out" : units <= threshold ? "low" : "available";
}

/**
 * Availability of a size. With a colour, that exact variant; without, the
 * best across colours (so a size is "sold out" only when every colour is).
 * `live` overrides the catalogue's stock with fresher numbers when known.
 */
export function sizeStatus(product: Product, size: string, colour?: string | null, live?: StockLevels | null): SizeStatus {
  const variants = product.variants.filter((v) => v.size === size && (!colour || v.colour === colour));
  if (variants.length === 0) return "sold-out";
  const units = (v: Variant) => live?.[variantKey(v.colour, v.size)] ?? v.stock;
  const best = variants.reduce((a, b) => (units(b) > units(a) ? b : a));
  return statusOf(units(best), best.lowStockThreshold);
}

export function isSoldOut(product: Product, live?: StockLevels | null) {
  return product.variants.every((v) => (live?.[variantKey(v.colour, v.size)] ?? v.stock) <= 0);
}

export function recommendationsFor(products: Product[], product: Product, count = 4) {
  const sameCategory = products.filter((p) => p.slug !== product.slug && p.category === product.category);
  const others = products.filter((p) => p.slug !== product.slug && p.category !== product.category);
  return [...sameCategory, ...others].slice(0, count);
}

export function newArrivals(products: Product[]) {
  return products.filter((p) => p.isNew).sort((a, b) => b.addedOn.localeCompare(a.addedOn));
}
