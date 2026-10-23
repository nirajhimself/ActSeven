import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { variantKey, type Catalog, type Product, type StockLevels, type Style } from "@/lib/catalog";
import { prisma } from "./prisma";

/** Cache tag for everything read from the catalogue tables, including stock. */
export const CATALOG_TAG = "catalog";

/**
 * The active catalogue, cached. Server pages are prerendered from it and
 * refresh when CATALOG_TAG is invalidated (admin stock changes, orders,
 * restocks) or, for edits made directly in the database (e.g. Prisma
 * Studio), within about a minute.
 */
export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("minutes");

  const db = prisma();
  const [categories, products] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.product.findMany({
      where: { status: "active" },
      orderBy: { sortOrder: "asc" },
      include: {
        category: { select: { slug: true } },
        colours: { orderBy: { sortOrder: "asc" }, include: { colour: true } },
        images: { orderBy: { sortOrder: "asc" } },
        variants: { where: { active: true }, include: { colour: true, size: true, inventory: true } },
      },
    }),
  ]);

  return {
    categories: categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      image: { src: c.imageUrl, alt: c.imageAlt, position: c.imagePosition ?? undefined },
    })),
    products: products.map((p): Product => {
      const sizes = [...new Map(p.variants.map((v) => [v.size.label, v.size.sortOrder])).entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([label]) => label);
      return {
        slug: p.slug,
        name: p.name,
        category: p.category.slug,
        price: p.price,
        colours: p.colours.map(({ colour }) => ({ name: colour.name, hex: colour.hex })),
        sizes,
        images: p.images.map((i) => ({ src: i.url, alt: i.alt, position: i.position ?? undefined })),
        summary: p.summary,
        description: p.description,
        highlights: p.highlights,
        fabric: p.fabric,
        fit: p.fit,
        care: p.care,
        styles: p.styles as Style[],
        isNew: p.isNew,
        campaigns: p.campaigns,
        addedOn: p.addedOn.toISOString().slice(0, 10),
        variants: p.variants.map((v) => ({
          sku: v.sku,
          colour: v.colour.name,
          size: v.size.label,
          price: v.priceOverride ?? p.price,
          stock: v.inventory?.quantity ?? 0,
          lowStockThreshold: v.inventory?.lowStockThreshold ?? 3,
        })),
      };
    }),
  };
}

export async function getProductBySlug(slug: string) {
  return (await getCatalog()).products.find((p) => p.slug === slug);
}

/** Uncached stock for one product (for the product page's live availability). */
export async function getLiveStock(slug: string): Promise<StockLevels> {
  const rows = await prisma().inventory.findMany({
    where: { variant: { product: { slug }, active: true } },
    select: { quantity: true, variant: { select: { colour: { select: { name: true } }, size: { select: { label: true } } } } },
  });
  return Object.fromEntries(rows.map((r) => [variantKey(r.variant.colour.name, r.variant.size.label), r.quantity]));
}

export type CheckoutVariant = { variantId: number; slug: string; name: string; colour: string; size: string; price: number; stock: number };

/**
 * Uncached variant lookup for pricing an order: prices and availability must
 * be current when money is involved, not up to a minute old.
 * Keyed by `${slug}|${colour}|${size}`; only active products and variants.
 */
export async function getCheckoutVariants(slugs: string[]): Promise<Map<string, CheckoutVariant>> {
  const rows = await prisma().variant.findMany({
    where: { active: true, product: { slug: { in: [...new Set(slugs)] }, status: "active" } },
    select: {
      id: true,
      priceOverride: true,
      inventory: { select: { quantity: true } },
      product: { select: { slug: true, name: true, price: true } },
      colour: { select: { name: true } },
      size: { select: { label: true } },
    },
  });
  return new Map(
    rows.map((v) => [
      `${v.product.slug}|${v.colour.name}|${v.size.label}`,
      { variantId: v.id, slug: v.product.slug, name: v.product.name, colour: v.colour.name, size: v.size.label, price: v.priceOverride ?? v.product.price, stock: v.inventory?.quantity ?? 0 },
    ]),
  );
}
