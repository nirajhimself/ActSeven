"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin";
import { parseDiscountForm, saveDiscount, type DiscountFieldErrors } from "@/lib/server/admin-discounts";

/** Saves the discount code form. Returns field errors, or redirects to the list on success. */
export async function saveDiscountAction(formData: FormData): Promise<{ errors: DiscountFieldErrors }> {
  const admin = await requireAdmin();
  const rawId = String(formData.get("discountId") ?? "");
  const id = /^\d+$/.test(rawId) ? Number(rawId) : null;

  const { input, errors } = parseDiscountForm(formData);
  if (Object.keys(errors).length) return { errors };

  let result;
  try {
    result = await saveDiscount(id, input);
  } catch (err) {
    console.error("[admin] save discount failed", err);
    return { errors: { form: "The code couldn't be saved. Please try again." } };
  }
  if (!result.ok) return { errors: result.errors };

  await admin.audit(id ? "discount.update" : "discount.create", "discount", String(result.id), {
    code: input.code,
    type: input.type,
    value: input.value,
    active: input.active,
  });
  redirect(`/admin/discounts?saved=${encodeURIComponent(input.code)}`);
}
