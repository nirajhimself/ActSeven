import "server-only";
import type { Prisma } from "@prisma/client";
import type { Catalog, Category, Product, Style } from "@/lib/catalog";
import { prisma, withReadRetry } from "./prisma";

/**
 * Storefront data access for the catalogue (Prisma, server only).
 *
 * - Public reads only ever return ACTIVE products; drafts and archived
 *   products never leak through these functions.
 * - Each read is a single query with SQL joins (relationLoadStrategy "join"),
 *   so there are no N+1 queries.
 * - No Next.js imports: lib/server/catalog.ts adds caching on top, and the
 *   functions can be reused by checkout, admin tools and tests.
 */

export const PUBLIC_STATUS = "active";

/** Relations needed to build a storefront Product. */
const productInclude = {
  category: { select: { slug: true } },
  colours: { orderBy: { sortOrder: "asc" }, select: { colour: { select: { name: true, hex: true } } } },
  images: { orderBy: { sortOrder: "asc" }, select: { url: true, alt: true, position: true } },
  variants: {
    where: { active: true },
    select: {
      sku: true,
      priceOverride: true,
      colour: { select: { name: true } },
      size: { select: { label: true, sortOrder: true } },
      inventory: { select: { quantity: true, lowStockThreshold: true } },
    },
  },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/** Maps a database row to the storefront's Product shape (lib/catalog.ts). */
export function toProduct(p: ProductRow): Product {
  const sizes = [...new Map(p.variants.map((v) => [v.size.label, v.size.sortOrder])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);
  return {
    slug: p.slug,
    name: p.name,
    category: p.category.slug,
    price: p.price,
    colours: p.colours.map(({ colour }) => colour),
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
    featured: p.featured,
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
}

function toCategory(c: { slug: string; name: string; tagline: string; imageUrl: string; imageAlt: string; imagePosition: string | null }): Category {
  return { slug: c.slug, name: c.name, tagline: c.tagline, image: { src: c.imageUrl, alt: c.imageAlt, position: c.imagePosition ?? undefined } };
}

/** Every category and every active product, in merchandising order. */
export async function loadCatalog(): Promise<Catalog> {
  const db = prisma();
  const [categories, products] = await withReadRetry(() =>
    Promise.all([
      db.category.findMany({ orderBy: { sortOrder: "asc" } }),
      db.product.findMany({
        relationLoadStrategy: "join",
        where: { status: PUBLIC_STATUS },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: productInclude,
      }),
    ]),
  );
  return { categories: categories.map(toCategory), products: products.map(toProduct) };
}

/** One active product by slug, or null if it doesn't exist or isn't public. */
export async function getPublicProduct(slug: string): Promise<Product | null> {
  if (typeof slug !== "string" || slug.length > 200) return null;
  const row = await withReadRetry(() =>
    prisma().product.findFirst({ relationLoadStrategy: "join", where: { slug, status: PUBLIC_STATUS }, include: productInclude }),
  );
  return row ? toProduct(row) : null;
}

// ---------------------------------------------------------------- listing

export type ProductSort = "featured" | "newest" | "price-asc" | "price-desc";

export type ProductQuery = {
  /** Category slug. */
  category?: string;
  /** Size labels; matches products with an in-stock active variant in any of them. */
  sizes?: string[];
  /** Colour names. */
  colours?: string[];
  styles?: string[];
  /** Inclusive rupee ranges; a product matches if its price falls in any. */
  priceRanges?: { min: number; max: number }[];
  inStock?: boolean;
  featured?: boolean;
  isNew?: boolean;
  /** Free-text search across name, summary, fabric, category and colours. */
  q?: string;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
};

export type ProductPage = { items: Product[]; total: number; page: number; pageSize: number; pageCount: number };

const inStockVariant = { active: true, inventory: { quantity: { gt: 0 } } } satisfies Prisma.VariantWhereInput;

/** Builds the WHERE clause for a storefront query (always restricted to active products). */
export function productWhere(query: ProductQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [{ status: PUBLIC_STATUS }];
  if (query.category) and.push({ category: { slug: query.category } });
  if (query.sizes?.length) and.push({ variants: { some: { ...inStockVariant, size: { label: { in: query.sizes } } } } });
  if (query.colours?.length) and.push({ colours: { some: { colour: { name: { in: query.colours } } } } });
  if (query.styles?.length) and.push({ styles: { hasSome: query.styles } });
  if (query.priceRanges?.length) {
    and.push({ OR: query.priceRanges.map((r) => ({ price: { gte: Math.max(0, r.min), lte: Number.isFinite(r.max) ? r.max : undefined } })) });
  }
  if (query.inStock) and.push({ variants: { some: inStockVariant } });
  if (query.featured) and.push({ featured: true });
  if (query.isNew) and.push({ isNew: true });
  for (const term of (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)) {
    const t = term.replace(/s$/, ""); // "shirts" finds "shirt"
    and.push({
      OR: [
        { name: { contains: t, mode: "insensitive" } },
        { summary: { contains: t, mode: "insensitive" } },
        { fabric: { contains: t, mode: "insensitive" } },
        { category: { name: { contains: t, mode: "insensitive" } } },
        { colours: { some: { colour: { name: { contains: t, mode: "insensitive" } } } } },
        { styles: { has: t } },
      ],
    });
  }
  return { AND: and };
}

/** Stable ordering: every sort ends with the id so pages never overlap or skip. */
function productOrder(sort: ProductSort = "featured"): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ addedOn: "desc" }, { id: "asc" }];
    case "price-asc":
      return [{ price: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ price: "desc" }, { id: "asc" }];
    default:
      return [{ sortOrder: "asc" }, { id: "asc" }];
  }
}

/** Filtered, sorted, paginated active products. */
export async function listProducts(query: ProductQuery = {}): Promise<ProductPage> {
  const pageSize = Math.min(Math.max(Math.floor(query.pageSize ?? 24), 1), 100);
  const page = Math.max(Math.floor(query.page ?? 1), 1);
  const where = productWhere(query);
  const db = prisma();
  const [rows, total] = await withReadRetry(() =>
    Promise.all([
      db.product.findMany({
        relationLoadStrategy: "join",
        where,
        orderBy: productOrder(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: productInclude,
      }),
      db.product.count({ where }),
    ]),
  );
  return { items: rows.map(toProduct), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function searchProducts(q: string, limit = 12) {
  return (await listProducts({ q: q.slice(0, 100), pageSize: limit })).items;
}

export async function getFeaturedProducts(limit = 4) {
  return (await listProducts({ featured: true, pageSize: limit })).items;
}

export async function getNewArrivals(limit = 4) {
  return (await listProducts({ isNew: true, sort: "newest", pageSize: limit })).items;
}

/** Categories, each with its active products. */
export async function getCategoriesWithProducts() {
  const { categories, products } = await loadCatalog();
  return categories.map((c) => ({ ...c, products: products.filter((p) => p.category === c.slug) }));
}

/** Every active variant of an active product with its live stock (null if the product isn't public). */
export async function getVariantAvailability(slug: string) {
  const product = await getPublicProduct(slug);
  return product?.variants.map((v) => ({ ...v, available: v.stock > 0 })) ?? null;
}

// ---------------------------------------------------------------- checkout support

export type CheckoutVariant = {
  variantId: number;
  sku: string;
  slug: string;
  name: string;
  colour: string;
  size: string;
  price: number;
  stock: number;
};

/**
 * Uncached variant lookup for pricing an order: prices and availability must
 * be current when money is involved. Keyed by `${slug}|${colour}|${size}`;
 * only active variants of active products.
 */
export async function getCheckoutVariants(slugs: string[]): Promise<Map<string, CheckoutVariant>> {
  const rows = await withReadRetry(() =>
    prisma().variant.findMany({
      relationLoadStrategy: "join",
      where: { active: true, product: { slug: { in: [...new Set(slugs)].slice(0, 100) }, status: PUBLIC_STATUS } },
      select: {
        id: true,
        sku: true,
        priceOverride: true,
        inventory: { select: { quantity: true } },
        product: { select: { slug: true, name: true, price: true } },
        colour: { select: { name: true } },
        size: { select: { label: true } },
      },
    }),
  );
  return new Map(
    rows.map((v) => [
      `${v.product.slug}|${v.colour.name}|${v.size.label}`,
      {
        variantId: v.id,
        sku: v.sku,
        slug: v.product.slug,
        name: v.product.name,
        colour: v.colour.name,
        size: v.size.label,
        price: v.priceOverride ?? v.product.price,
        stock: v.inventory?.quantity ?? 0,
      },
    ]),
  );
}
