"use client";

import { createContext, use, type ReactNode } from "react";
import type { Catalog } from "@/lib/catalog";

const CatalogContext = createContext<Catalog>({ products: [], categories: [] });

/**
 * Makes the catalogue (read from the database by the root layout) available
 * to client components such as the bag, search and wishlist.
 */
export function CatalogProvider({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
  return <CatalogContext value={catalog}>{children}</CatalogContext>;
}

export function useCatalog() {
  return use(CatalogContext);
}
