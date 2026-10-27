"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin";
import { addColour, parseProductForm, saveProduct, type FieldErrors } from "@/lib/server/admin-products";
import { CATALOG_TAG } from "@/lib/server/catalog";
import { setStockLevels, stockChangesFrom } from "@/lib/server/inventory";
import { MAX_MEDIA_BYTES, mediaUrl, saveMedia } from "@/lib/server/media";

/** Saves the product form. Returns field errors, or redirects to the product on success. */
export async function saveProductAction(formData: FormData): Promise<{ errors: FieldErrors }> {
  const admin = await requireAdmin();
  const rawId = String(formData.get("productId") ?? "");
  const id = /^\d+$/.test(rawId) ? Number(rawId) : null;

  const { input, errors } = parseProductForm(formData);
  const stock = stockChangesFrom(formData);
  if (stock.invalid) errors.variants = "Stock must be a whole number from 0 to 1,00,000.";
  if (Object.keys(errors).length) return { errors };

  let result;
  try {
    result = await saveProduct(id, input);
  } catch (err) {
    console.error("[admin] save product failed", err);
    return { errors: { form: "The product couldn't be saved. Please try again." } };
  }
  if (!result.ok) return { errors: result.errors };

  if (stock.levels.length) {
    try {
      await setStockLevels(stock.levels);
    } catch (err) {
      console.error("[admin] save stock failed", err);
      updateTag(CATALOG_TAG);
      return { errors: { variants: "The product was saved, but the stock couldn't be. Please try again." } };
    }
    await admin.audit("inventory.update", "inventory", null, { changes: stock.levels.slice(0, 200) });
  }
  updateTag(CATALOG_TAG);
  await admin.audit(id ? "product.update" : "product.create", "product", String(result.id), {
    slug: result.slug,
    status: input.status,
    price: input.price,
  });
  redirect(`/admin/products/${result.id}?saved=1`);
}

export async function addColourAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "");
  const hex = String(formData.get("hex") ?? "");
  const res = await addColour(name, hex);
  if (!res.ok) return res;
  await admin.audit("colour.create", "colour", null, { name, hex });
  refresh();
  return { ok: true };
}

/** Stores a product photo uploaded from the product form; returns its URL for the image field. */
export async function uploadImageAction(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a photo to upload." };
  if (file.size > MAX_MEDIA_BYTES) return { ok: false, error: "The photo is too large. Please use one under 950 KB." };
  let result;
  try {
    result = await saveMedia(Buffer.from(await file.arrayBuffer()), admin.username);
  } catch (err) {
    console.error("[admin] image upload failed", err);
    return { ok: false, error: "The photo couldn't be uploaded. Please try again." };
  }
  if (!result.ok) return result;
  await admin.audit("media.upload", "media", result.id, { name: file.name.slice(0, 120), size: file.size });
  return { ok: true, url: mediaUrl(result.id) };
}
