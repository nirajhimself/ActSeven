"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin";
import { addColour, parseProductForm, saveProduct, type FieldErrors } from "@/lib/server/admin-products";
import { CATALOG_TAG } from "@/lib/server/catalog";

/** Saves the product form. Returns field errors, or redirects to the product on success. */
export async function saveProductAction(formData: FormData): Promise<{ errors: FieldErrors }> {
  const admin = await requireAdmin();
  const rawId = String(formData.get("productId") ?? "");
  const id = /^\d+$/.test(rawId) ? Number(rawId) : null;

  const { input, errors } = parseProductForm(formData);
  if (Object.keys(errors).length) return { errors };

  let result;
  try {
    result = await saveProduct(id, input);
  } catch (err) {
    console.error("[admin] save product failed", err);
    return { errors: { form: "The product couldn't be saved. Please try again." } };
  }
  if (!result.ok) return { errors: result.errors };

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
