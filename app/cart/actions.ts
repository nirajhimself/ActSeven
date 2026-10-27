"use server";

import { getCurrentCustomer } from "@/lib/server/auth";
import { getCustomerCart, mergeCartLines, saveCustomerCart, cleanLines, type CartLineInput } from "@/lib/server/cart";

/**
 * Signed-in only: merges this device's bag with the one saved on the account,
 * saves the result and returns it. `base` is the bag this device last synced
 * (see mergeCartLines). Returns null for guests.
 */
export async function syncCartAction(deviceLines: CartLineInput[], base?: CartLineInput[] | null): Promise<CartLineInput[] | null> {
  const customer = await getCurrentCustomer().catch(() => null);
  if (!customer) return null;
  try {
    const merged = mergeCartLines(await getCustomerCart(customer.id), cleanLines(deviceLines), base ? cleanLines(base) : null);
    await saveCustomerCart(customer.id, merged);
    return merged;
  } catch (err) {
    console.error("[cart] sync failed", err);
    return null;
  }
}

/** Signed-in only: saves the bag to the account (no-op for guests). */
export async function saveCartAction(lines: CartLineInput[]): Promise<void> {
  const customer = await getCurrentCustomer().catch(() => null);
  if (!customer) return;
  await saveCustomerCart(customer.id, lines).catch((err) => console.error("[cart] save failed", err));
}
