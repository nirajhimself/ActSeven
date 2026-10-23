"use client";

import { ButtonLink } from "@/components/ui/Button";
import { useCatalog } from "@/components/catalog/CatalogProvider";
import { findProduct, type Product } from "@/lib/catalog";
import { useWishlist } from "@/lib/wishlist";
import { ProductGrid } from "./ProductGrid";

export function WishlistGrid() {
  const { products } = useCatalog();
  const saved = useWishlist()
    .map((slug) => findProduct(products, slug))
    .filter((p): p is Product => Boolean(p));

  if (saved.length === 0) {
    return (
      <div className="flex flex-col items-start gap-5 py-6">
        <p className="text-sm text-taupe">Nothing saved yet. Tap the heart on any piece to keep it here.</p>
        <ButtonLink href="/collections/all" variant="outline">
          Browse the collection
        </ButtonLink>
      </div>
    );
  }
  return <ProductGrid products={saved} eagerCount={2} />;
}
