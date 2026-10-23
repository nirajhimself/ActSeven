"use client";

import { useEffect } from "react";
import { saveCartAction, syncCartAction } from "@/app/cart/actions";
import { ACCOUNT_EVENT, clearCart, getCartSnapshot, replaceCartLines, subscribeCart } from "@/lib/cart";

type Line = { slug: string; colour: string; size: string; quantity: number };

const plain = (): Line[] => getCartSnapshot().lines.map(({ slug, colour, size, quantity }) => ({ slug, colour, size, quantity }));

/** The bag as this device last synced it with the account (the merge base). */
const BASE_KEY = "act-vii:cart-synced";
function readBase(): Line[] | null {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    return raw ? (JSON.parse(raw) as Line[]) : null;
  } catch {
    return null;
  }
}
function writeBase(lines: Line[] | null) {
  try {
    if (lines) localStorage.setItem(BASE_KEY, JSON.stringify(lines));
    else localStorage.removeItem(BASE_KEY);
  } catch {
    // storage unavailable: the next sync simply keeps both bags
  }
}

/**
 * Keeps a signed-in shopper's bag in their account, so it follows them across
 * devices. On load (and right after signing in) the device bag is merged with
 * the saved one; after that, every change is saved shortly after it happens.
 * Guests are unaffected: their bag stays in this browser only.
 */
export function CartSync() {
  useEffect(() => {
    let signedIn = false;
    let applying = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = async () => {
      const merged = await syncCartAction(plain(), readBase()).catch(() => null);
      signedIn = merged !== null;
      if (merged) {
        applying = true;
        replaceCartLines(merged);
        applying = false;
        writeBase(merged);
      }
    };

    const unsubscribe = subscribeCart(() => {
      if (!signedIn || applying) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const lines = plain();
        saveCartAction(lines)
          .then(() => writeBase(lines))
          .catch(() => {});
      }, 600);
    });

    const onAccount = (e: Event) => {
      clearTimeout(timer);
      if ((e as CustomEvent<{ signedIn: boolean }>).detail.signedIn) {
        void sync();
      } else {
        // Signed out: the bag stays saved on the account, not on this device.
        signedIn = false;
        writeBase(null);
        clearCart();
      }
    };

    void sync();
    window.addEventListener(ACCOUNT_EVENT, onAccount);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      window.removeEventListener(ACCOUNT_EVENT, onAccount);
    };
  }, []);
  return null;
}
