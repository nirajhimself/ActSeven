import "server-only";
import { randomUUID } from "node:crypto";
import type { OrderStatus } from "./orders";
import { db } from "./db";

export type Address = {
  id: string;
  name: string;
  phone: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

export type AddressInput = Omit<Address, "id" | "isDefault">;

const toAddress = (r: Record<string, unknown>): Address => ({
  id: r.id as string,
  name: r.name as string,
  phone: r.phone as string,
  address1: r.address1 as string,
  address2: (r.address2 as string | null) ?? null,
  city: r.city as string,
  state: r.state as string,
  pincode: r.pincode as string,
  isDefault: r.is_default as boolean,
});

export async function updateProfile(customerId: string, profile: { name: string; phone: string | null }) {
  await db()`update customers set name = ${profile.name || null}, phone = ${profile.phone}, updated_at = now() where id = ${customerId}`;
}

/** Fills name/phone only where the profile is still empty (used after checkout). */
export async function fillProfileGaps(customerId: string, profile: { name: string; phone: string }) {
  await db()`
    update customers set name = coalesce(name, ${profile.name}), phone = coalesce(phone, ${profile.phone}), updated_at = now()
     where id = ${customerId}`;
}

export async function listAddresses(customerId: string) {
  const rows = await db()`select * from addresses where customer_id = ${customerId} order by is_default desc, created_at`;
  return rows.map(toAddress);
}

export async function saveAddress(customerId: string, input: AddressInput, opts: { id?: string; makeDefault?: boolean } = {}) {
  const sql = db();
  return sql.begin(async (tx) => {
    const [{ count }] = await tx`select count(*)::int as count from addresses where customer_id = ${customerId}`;
    const makeDefault = opts.makeDefault || count === 0;
    if (makeDefault) await tx`update addresses set is_default = false where customer_id = ${customerId}`;
    if (opts.id) {
      const rows = await tx`
        update addresses set name = ${input.name}, phone = ${input.phone}, address1 = ${input.address1},
               address2 = ${input.address2 || null}, city = ${input.city}, state = ${input.state}, pincode = ${input.pincode},
               is_default = ${makeDefault} or is_default
         where id = ${opts.id} and customer_id = ${customerId}
        returning id`;
      return rows.length > 0;
    }
    if (count >= 10) return false;
    await tx`
      insert into addresses (id, customer_id, name, phone, address1, address2, city, state, pincode, is_default)
      values (${randomUUID()}, ${customerId}, ${input.name}, ${input.phone}, ${input.address1}, ${input.address2 || null},
              ${input.city}, ${input.state}, ${input.pincode}, ${makeDefault})`;
    return true;
  });
}

export async function deleteAddress(customerId: string, id: string) {
  const sql = db();
  await sql.begin(async (tx) => {
    const [deleted] = await tx`delete from addresses where id = ${id} and customer_id = ${customerId} returning is_default`;
    // Promote the oldest remaining address if the default was removed.
    if (deleted?.is_default) {
      await tx`
        update addresses set is_default = true
         where id = (select id from addresses where customer_id = ${customerId} order by created_at limit 1)`;
    }
  });
}

export async function setDefaultAddress(customerId: string, id: string) {
  await db().begin(async (tx) => {
    const [exists] = await tx`select 1 from addresses where id = ${id} and customer_id = ${customerId}`;
    if (!exists) return;
    await tx`update addresses set is_default = (id = ${id}) where customer_id = ${customerId}`;
  });
}

/** Saves a checkout address unless an identical one is already on file. */
export async function rememberAddress(customerId: string, input: AddressInput) {
  const [dup] = await db()`
    select 1 from addresses
     where customer_id = ${customerId} and lower(address1) = lower(${input.address1}) and pincode = ${input.pincode}`;
  if (!dup) await saveAddress(customerId, input);
}

export async function getWishlist(customerId: string) {
  const rows = await db()`select product_slug from wishlist_items where customer_id = ${customerId} order by created_at`;
  return rows.map((r) => r.product_slug as string);
}

export async function addWishlistItems(customerId: string, slugs: string[]) {
  if (slugs.length === 0) return;
  await db()`
    insert into wishlist_items ${db()(slugs.map((s) => ({ customer_id: customerId, product_slug: s })))}
    on conflict do nothing`;
}

export async function removeWishlistItem(customerId: string, slug: string) {
  await db()`delete from wishlist_items where customer_id = ${customerId} and product_slug = ${slug}`;
}

export type OrderHistoryItem = {
  id: string;
  number: string;
  status: OrderStatus;
  total: number;
  createdAt: Date;
  itemCount: number;
  trackingNumber: string | null;
};

/** Orders linked to the account, plus guest orders placed with the same (verified) email. */
export async function listCustomerOrders(customer: { id: string; email: string }): Promise<OrderHistoryItem[]> {
  const rows = await db()`
    select o.id, o.number, o.status, o.total, o.created_at, o.tracking_number,
           coalesce(sum(i.quantity), 0)::int as item_count
      from orders o left join order_items i on i.order_id = o.id
     where o.customer_id = ${customer.id} or lower(o.email) = ${customer.email}
     group by o.id
     order by o.created_at desc
     limit 50`;
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    total: r.total,
    createdAt: r.created_at,
    itemCount: r.item_count,
    trackingNumber: r.tracking_number,
  }));
}
