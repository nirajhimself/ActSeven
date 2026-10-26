"use server";

import { refresh } from "next/cache";
import { validateAddress, type AddressFields } from "@/lib/address-validation";
import { getCatalog } from "@/lib/server/catalog";
import { normalisePhone } from "@/lib/india";
import { endSession, getCurrentCustomer, isAuthConfigured, issueLoginCode, normaliseEmail, verifyLoginCode } from "@/lib/server/auth";
import {
  addWishlistItems,
  deleteAddress,
  getWishlist,
  listAddresses,
  removeWishlistItem,
  saveAddress,
  setDefaultAddress,
  updateProfile,
  type Address,
} from "@/lib/server/customers";
import { clientIp } from "@/lib/server/client-ip";
import { isEmailConfigured, sendLoginCode } from "@/lib/server/email";

const devMode = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------- sign-in

export async function requestLoginCodeAction(rawEmail: string): Promise<{ ok: true; devCode?: string } | { ok: false; error: string }> {
  if (!isAuthConfigured()) {
    console.error("[auth] sign-in is off: DATABASE_URL or AUTH_SECRET (32+ chars) is not set");
    return { ok: false, error: "Sign-in isn't available yet." };
  }
  const email = normaliseEmail(rawEmail);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  // In production a code can only be delivered by email.
  if (!isEmailConfigured() && !devMode) {
    console.error("[auth] sign-in is off: RESEND_API_KEY and EMAIL_FROM must be set to email codes");
    return { ok: false, error: "Sign-in isn't available yet." };
  }

  try {
    const issued = await issueLoginCode(email, await clientIp());
    if (!issued.ok) return { ok: false, error: "Too many codes requested. Please wait an hour and try again." };
    if (isEmailConfigured()) {
      await sendLoginCode(email, issued.code);
      return { ok: true };
    }
    // Development without an email provider: surface the code so sign-in can be tested.
    console.info(`[auth] Development sign-in code for ${email}: ${issued.code}`);
    return { ok: true, devCode: issued.code };
  } catch (err) {
    console.error("[auth] requestLoginCode failed", err);
    return { ok: false, error: "We couldn't send a code just now. Please try again." };
  }
}

export async function verifyLoginCodeAction(rawEmail: string, rawCode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAuthConfigured()) return { ok: false, error: "Sign-in isn't available yet." };
  const email = normaliseEmail(rawEmail);
  const code = String(rawCode ?? "").replace(/\D/g, "");
  if (!email || code.length !== 6) return { ok: false, error: "Enter the 6-digit code from your email." };
  try {
    const result = await verifyLoginCode(email, code);
    if (result.ok) {
      refresh();
      return { ok: true };
    }
    return {
      ok: false,
      error:
        result.reason === "invalid"
          ? "That code isn't right. Please check and try again."
          : result.reason === "locked"
            ? "Too many incorrect attempts. Request a new code."
            : "That code has expired. Request a new one.",
    };
  } catch (err) {
    console.error("[auth] verifyLoginCode failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function signOutAction() {
  await endSession();
  refresh();
}

// ---------------------------------------------------------------- profile

export async function updateProfileAction(input: { name: string; phone: string }): Promise<{ ok: boolean; error?: string }> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "Please sign in again." };
  const name = String(input?.name ?? "").trim().slice(0, 120);
  const rawPhone = String(input?.phone ?? "").trim();
  const phone = rawPhone ? normalisePhone(rawPhone) : null;
  if (rawPhone && !phone) return { ok: false, error: "Enter a 10-digit Indian mobile number." };
  await updateProfile(customer.id, { name, phone });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- addresses

export type AddressResult = { ok: true } | { ok: false; error: string; fieldErrors?: Partial<Record<keyof AddressFields, string>> };

export async function saveAddressAction(input: AddressFields & { id?: string; makeDefault?: boolean }): Promise<AddressResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "Please sign in again." };
  const { value, errors } = validateAddress(input ?? {});
  if (Object.keys(errors).length) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: errors };
  const id = typeof input.id === "string" && /^[0-9a-f-]{36}$/i.test(input.id) ? input.id : undefined;
  const saved = await saveAddress(customer.id, value, { id, makeDefault: Boolean(input.makeDefault) });
  if (!saved) return { ok: false, error: id ? "That address no longer exists." : "You can save up to 10 addresses." };
  refresh();
  return { ok: true };
}

export async function deleteAddressAction(id: string) {
  const customer = await getCurrentCustomer();
  if (!customer || !/^[0-9a-f-]{36}$/i.test(String(id))) return;
  await deleteAddress(customer.id, id);
  refresh();
}

export async function setDefaultAddressAction(id: string) {
  const customer = await getCurrentCustomer();
  if (!customer || !/^[0-9a-f-]{36}$/i.test(String(id))) return;
  await setDefaultAddress(customer.id, id);
  refresh();
}

// ---------------------------------------------------------------- wishlist sync

/** Keeps only slugs of products in the catalogue. */
async function validSlugs(slugs: unknown) {
  const known = new Set((await getCatalog()).products.map((p) => p.slug));
  return (Array.isArray(slugs) ? slugs : []).filter((s): s is string => typeof s === "string" && known.has(s)).slice(0, 200);
}

/** Merges the device wishlist into the account and returns the combined list (null when signed out). */
export async function syncWishlistAction(localSlugs: string[]): Promise<string[] | null> {
  const customer = await getCurrentCustomer();
  if (!customer) return null;
  await addWishlistItems(customer.id, await validSlugs(localSlugs));
  return getWishlist(customer.id);
}

/** Mirrors a heart toggle to the account. No-op for guests. */
export async function setWishlistItemAction(slug: string, saved: boolean) {
  const customer = await getCurrentCustomer();
  if (!customer || (await validSlugs([slug])).length === 0) return;
  if (saved) await addWishlistItems(customer.id, [slug]);
  else await removeWishlistItem(customer.id, slug);
}

// ---------------------------------------------------------------- checkout prefill

export async function getCheckoutPrefillAction(): Promise<{ email: string; name: string | null; phone: string | null; addresses: Address[] } | null> {
  const customer = await getCurrentCustomer();
  if (!customer) return null;
  return { email: customer.email, name: customer.name, phone: customer.phone, addresses: await listAddresses(customer.id) };
}
