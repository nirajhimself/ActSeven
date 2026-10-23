"use client";

import { useSyncExternalStore } from "react";

/**
 * Minimal external store with optional localStorage persistence. The server
 * snapshot is always the initial value, so the first client render matches
 * the HTML and persisted state appears right after hydration.
 */
export function createStore<T>(initial: T, opts?: { key: string; validate: (v: unknown) => v is T }) {
  let state = initial;
  let loaded = !opts;
  const listeners = new Set<() => void>();

  function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(opts!.key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (opts!.validate(parsed)) state = parsed;
      }
    } catch {
      // Storage unavailable (private mode, blocked cookies) — stay in memory.
    }
  }

  function get() {
    load();
    return state;
  }

  function set(update: (prev: T) => T) {
    state = update(get());
    if (opts) {
      try {
        window.localStorage.setItem(opts.key, JSON.stringify(state));
      } catch {
        // Ignore quota / availability errors.
      }
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (!opts || e.key !== opts.key) return;
      loaded = false;
      if (e.newValue === null) {
        state = initial;
        loaded = true;
      }
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function useValue() {
    return useSyncExternalStore(subscribe, get, () => initial);
  }

  return { get, set, useValue };
}

const noopSubscribe = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards. Lets views that
 * depend on persisted state show a placeholder instead of flashing their
 * empty state before localStorage is read.
 */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
