"use client";

import { setWishlistItemAction } from "@/app/account/actions";
import { createStore } from "./store";

const isSlugList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

const wishlist = createStore<string[]>([], { key: "act-vii:wishlist", validate: isSlugList });

export const useWishlist = wishlist.useValue;

export function toggleWishlist(slug: string) {
  const saved = !wishlist.get().includes(slug);
  wishlist.set((list) => (saved ? [...list, slug] : list.filter((s) => s !== slug)));
  // Mirror to the signed-in account (a no-op on the server for guests).
  setWishlistItemAction(slug, saved).catch(() => {});
}

/** Replaces the device wishlist, e.g. with the merged account list after sign-in. */
export function replaceWishlist(slugs: string[]) {
  wishlist.set(() => [...new Set(slugs)]);
}

export const getWishlistSnapshot = () => wishlist.get();
