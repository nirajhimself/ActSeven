import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Admin product management: validation and saving. Everything is validated
 * here on the server; callers must have checked requireAdmin() first.
 */

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export const STYLES = ["formal", "casual", "tailored", "relaxed"] as const;
/** Merchandising tags understood by the collection pages (lib/collections.ts). */
export const CAMPAIGNS = [
  { value: "winter-edit", label: "The Winter Edit" },
  { value: "tailoring", label: "Tailoring" },
] as const;
export const SIZE_SYSTEMS = [
  { value: "tops", label: "Tops (XS–XXL)" },
  { value: "waist", label: "Waist (28–38)" },
  { value: "chest", label: "Chest (36–46)" },
] as const;
const MAX_IMAGES = 8;

export type ProductInput = {
  name: string;
  slug: string;
  categoryId: number;
  price: number;
  status: (typeof PRODUCT_STATUSES)[number];
  featured: boolean;
  isNew: boolean;
  summary: string;
  description: string;
  highlights: string[];
  fabric: string;
  fit: string;
  care: string[];
  styles: string[];
  campaigns: string[];
  sizeSystem: string;
  colourIds: number[];
  images: { url: string; alt: string; position: string | null }[];
  /** Per existing variant: active flag and price override (rupees, or null for the product price). */
  variants: { id: number; active: boolean; priceOverride: number | null }[];
};

export type FieldErrors = Partial<Record<keyof ProductInput | "form", string>>;
export type SaveResult = { ok: true; id: number; slug: string } | { ok: false; errors: FieldErrors };

const text = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);
const lines = (v: FormDataEntryValue | null, maxLines: number, maxLen: number) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .map((l) => l.slice(0, maxLen));
const rupees = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(/[₹,\s]/g, "");
  return /^\d{1,7}$/.test(s) ? Number(s) : NaN;
};

/** An image is an absolute https URL or a path under /public (e.g. /products/shirt.jpg). */
export function isValidImageUrl(url: string) {
  if (/^\/[A-Za-z0-9/_\-.]+\.(jpe?g|png|webp|avif|gif|svg)$/i.test(url)) return !url.includes("..");
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Parses and validates the product form (server side). */
export function parseProductForm(form: FormData): { input: ProductInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = text(form.get("name"), 120);
  const slug = text(form.get("slug"), 80).toLowerCase();
  const price = rupees(form.get("price"));
  const status = text(form.get("status"), 20) as ProductInput["status"];
  const sizeSystem = text(form.get("sizeSystem"), 20);

  if (name.length < 2) errors.name = "Enter a product name.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.slug = "Use lowercase letters, numbers and single hyphens (e.g. linen-overshirt).";
  if (!Number.isInteger(price) || price < 1 || price > 1_000_000) errors.price = "Enter a whole-rupee price between ₹1 and ₹10,00,000.";
  if (!PRODUCT_STATUSES.includes(status)) errors.status = "Choose a status.";
  if (!SIZE_SYSTEMS.some((s) => s.value === sizeSystem)) errors.sizeSystem = "Choose a size range.";

  const categoryId = Number(form.get("categoryId"));
  if (!Number.isInteger(categoryId) || categoryId < 1) errors.categoryId = "Choose a category.";

  const colourIds = form
    .getAll("colourIds")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 20);
  if (colourIds.length === 0) errors.colourIds = "Choose at least one colour.";

  const images: ProductInput["images"] = [];
  for (let i = 0; i < MAX_IMAGES; i++) {
    const url = text(form.get(`image.${i}.url`), 500);
    if (!url) continue;
    const alt = text(form.get(`image.${i}.alt`), 200);
    const position = text(form.get(`image.${i}.position`), 20) || null;
    if (!isValidImageUrl(url)) errors.images = `Image ${i + 1}: use an https:// URL or a /path to a file in /public.`;
    else if (alt.length < 3) errors.images = `Image ${i + 1}: describe the photo in the alt text (for screen readers).`;
    else if (position && !/^\d{1,3}% \d{1,3}%$/.test(position)) errors.images = `Image ${i + 1}: focal point looks like "50% 30%".`;
    images.push({ url, alt, position });
  }

  const variants: ProductInput["variants"] = [];
  for (const key of new Set([...form.keys()].filter((k) => /^variant\.\d+\.present$/.test(k)))) {
    const id = Number(key.split(".")[1]);
    const rawPrice = String(form.get(`variant.${id}.price`) ?? "").trim();
    const override = rawPrice === "" ? null : rupees(rawPrice);
    if (override !== null && (!Number.isInteger(override) || override < 1)) {
      errors.variants = "Variant prices must be whole rupees, or blank to use the product price.";
    }
    variants.push({ id, active: form.get(`variant.${id}.active`) === "on", priceOverride: override !== null && Number.isInteger(override) ? override : null });
  }

  const input: ProductInput = {
    name,
    slug,
    categoryId,
    price,
    status,
    featured: form.get("featured") === "on",
    isNew: form.get("isNew") === "on",
    summary: text(form.get("summary"), 200),
    description: text(form.get("description"), 4000),
    highlights: lines(form.get("highlights"), 8, 80),
    fabric: text(form.get("fabric"), 300),
    fit: text(form.get("fit"), 300),
    care: lines(form.get("care"), 8, 120),
    styles: form.getAll("styles").map(String).filter((s) => (STYLES as readonly string[]).includes(s)),
    campaigns: form.getAll("campaigns").map(String).filter((c) => CAMPAIGNS.some((x) => x.value === c)),
    sizeSystem,
    colourIds,
    images,
    variants,
  };
  if (input.summary.length < 3) errors.summary = "Add a one-line summary.";
  if (input.description.length < 10) errors.description = "Add a description.";
  return { input, errors };
}

/**
 * Creates or updates a product with its colours, images and variants in one
 * transaction. Every colour × size in the size range has a variant: new ones
 * get a generated SKU and zero stock; variants no longer offered are switched
 * off, never deleted (past orders refer to them).
 */
export async function saveProduct(id: number | null, input: ProductInput): Promise<SaveResult> {
  const db = prisma();
  const [category, colours, sizes] = await Promise.all([
    db.category.findUnique({ where: { id: input.categoryId } }),
    db.colour.findMany({ where: { id: { in: input.colourIds } } }),
    db.size.findMany({ where: { system: input.sizeSystem }, orderBy: { sortOrder: "asc" } }),
  ]);
  const errors: FieldErrors = {};
  if (!category) errors.categoryId = "Choose a category.";
  if (colours.length !== new Set(input.colourIds).size) errors.colourIds = "One of the colours no longer exists.";
  if (sizes.length === 0) errors.sizeSystem = "That size range has no sizes.";
  if (input.status === "active" && input.images.length === 0) errors.images = "Add at least one image before making the product active.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const colourOrder = new Map(colours.map((c) => [c.id, c]));
  const orderedColours = input.colourIds.map((cid) => colourOrder.get(cid)!).filter(Boolean);
  const data = {
    name: input.name,
    slug: input.slug,
    categoryId: input.categoryId,
    price: input.price,
    status: input.status,
    featured: input.featured,
    isNew: input.isNew,
    summary: input.summary,
    description: input.description,
    highlights: input.highlights,
    fabric: input.fabric,
    fit: input.fit,
    care: input.care,
    styles: input.styles,
    campaigns: input.campaigns,
  };

  try {
    const saved = await db.$transaction(async (tx) => {
      const product = id
        ? await tx.product.update({ where: { id }, data })
        : await tx.product.create({
            data: { ...data, addedOn: new Date(), sortOrder: ((await tx.product.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1 },
          });

      const previousColours = new Set(
        (await tx.productColour.findMany({ where: { productId: product.id }, select: { colourId: true } })).map((c) => c.colourId),
      );
      await tx.productColour.deleteMany({ where: { productId: product.id } });
      await tx.productColour.createMany({ data: orderedColours.map((c, sortOrder) => ({ productId: product.id, colourId: c.id, sortOrder })) });

      await tx.productImage.deleteMany({ where: { productId: product.id } });
      await tx.productImage.createMany({
        data: input.images.map((img, sortOrder) => ({ productId: product.id, url: img.url, alt: img.alt, position: img.position, sortOrder })),
      });

      // Variants: one per colour × size in the chosen range.
      const existing = await tx.variant.findMany({ where: { productId: product.id } });
      const edits = new Map(input.variants.map((v) => [v.id, v]));
      const prefix =
        existing.map((v) => v.sku.match(/^(A7-\d{3,})-/)?.[1]).find(Boolean) ?? `A7-${String(product.id).padStart(3, "0")}`;
      const wanted = new Set<string>();
      for (const colour of orderedColours) {
        for (const size of sizes) {
          wanted.add(`${colour.id}:${size.id}`);
          const current = existing.find((v) => v.colourId === colour.id && v.sizeId === size.id);
          if (current) {
            // A colour just (re-)added switches its variants on; otherwise the form's settings apply.
            const edit = previousColours.has(colour.id) ? edits.get(current.id) : undefined;
            await tx.variant.update({
              where: { id: current.id },
              data: edit ? { active: edit.active, priceOverride: edit.priceOverride } : { active: true },
            });
          } else {
            let sku = `${prefix}-${colour.name.toUpperCase().replace(/[^A-Z0-9]+/g, "")}-${size.label}`;
            if (await tx.variant.findUnique({ where: { sku } })) sku = `${sku}-${product.id}`;
            await tx.variant.create({
              data: { productId: product.id, colourId: colour.id, sizeId: size.id, sku, inventory: { create: { quantity: 0 } } },
            });
          }
        }
      }
      // No longer offered (colour removed or a different size range): switch off, keep for order history.
      const retired = existing.filter((v) => !wanted.has(`${v.colourId}:${v.sizeId}`) && v.active).map((v) => v.id);
      if (retired.length) await tx.variant.updateMany({ where: { id: { in: retired } }, data: { active: false } });

      if (input.status === "active" && (await tx.variant.count({ where: { productId: product.id, active: true } })) === 0) {
        throw new ValidationError({ variants: "An active product needs at least one active variant." });
      }
      return product;
    });
    return { ok: true, id: saved.id, slug: saved.slug };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, errors: err.errors };
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, errors: { slug: "Another product already uses this URL slug." } };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, errors: { form: "This product no longer exists." } };
    }
    throw err;
  }
}

class ValidationError extends Error {
  constructor(public readonly errors: FieldErrors) {
    super("validation failed");
  }
}

export async function addColour(name: string, hex: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!/^[A-Za-z][A-Za-z -]{1,39}$/.test(clean)) return { ok: false, error: "Colour names use letters, spaces and hyphens." };
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return { ok: false, error: "Use a hex colour like #1e2737." };
  try {
    await prisma().colour.create({ data: { name: clean, hex: hex.toLowerCase() } });
    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: "That colour already exists." };
    throw err;
  }
}

// ---------------------------------------------------------------- reads

export async function listAdminProducts(opts: { q?: string; status?: string }) {
  const q = opts.q?.trim().slice(0, 80);
  const rows = await prisma().product.findMany({
    relationLoadStrategy: "join",
    where: {
      ...(PRODUCT_STATUSES.includes(opts.status as never) ? { status: opts.status } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { variants: { some: { sku: { contains: q, mode: "insensitive" } } } }] } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      price: true,
      status: true,
      featured: true,
      category: { select: { name: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, position: true } },
      variants: { select: { active: true, inventory: { select: { quantity: true } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    status: p.status,
    featured: p.featured,
    category: p.category.name,
    image: p.images[0] ?? null,
    activeVariants: p.variants.filter((v) => v.active).length,
    stock: p.variants.filter((v) => v.active).reduce((n, v) => n + (v.inventory?.quantity ?? 0), 0),
  }));
}

export async function getProductForEdit(id: number) {
  return prisma().product.findUnique({
    where: { id },
    include: {
      colours: { orderBy: { sortOrder: "asc" }, select: { colourId: true } },
      images: { orderBy: { sortOrder: "asc" } },
      variants: { include: { colour: true, size: true, inventory: true }, orderBy: [{ colourId: "asc" }, { size: { sortOrder: "asc" } }] },
    },
  });
}

export async function productFormOptions() {
  const db = prisma();
  const [categories, colours] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.colour.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, hex: true } }),
  ]);
  return { categories, colours };
}
