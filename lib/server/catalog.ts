import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { variantKey, type Catalog, type StockLevels } from "@/lib/catalog";
import { db } from "./db";
import { loadCatalog } from "./products";

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

  return loadCatalog();
}

export async function getProductBySlug(slug: string) {
  return (await getCatalog()).products.find((p) => p.slug === slug);
}

/**
 * Uncached stock for one product (for the product page's live availability).
 * One SQL round trip — this runs on every product view, and Prisma would
 * split the nested relations into several queries.
 */
export async function getLiveStock(slug: string): Promise<StockLevels> {
  const rows = await db()`
    select c.name as colour, s.label as size, i.quantity
      from inventory i
      join variants v on v.id = i.variant_id
      join products p on p.id = v.product_id
      join colours c on c.id = v.colour_id
      join sizes s on s.id = v.size_id
     where p.slug = ${slug} and p.status = 'active' and v.active`;
  return Object.fromEntries(rows.map((r) => [variantKey(r.colour, r.size), r.quantity as number]));
}

export { getCheckoutVariants, type CheckoutVariant } from "./products";
