"use client";

import Link from "next/link";
import { Monogram } from "@/components/brand/Logo";
import { CloseIcon } from "@/components/ui/Icons";
import { Sheet } from "@/components/ui/Sheet";
import { useCatalog } from "@/components/catalog/CatalogProvider";

const featured = [
  { label: "Shop All", href: "/collections/all" },
  { label: "New Arrivals", href: "/collections/new-arrivals" },
  { label: "The Winter Edit", href: "/collections/winter-edit" },
  { label: "Tailoring", href: "/collections/tailoring" },
];

export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { categories } = useCatalog();
  return (
    <Sheet open={open} onClose={onClose} side="left" labelledBy="mobile-menu-title">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-obsidian/10 px-5 py-3">
          <h2 id="mobile-menu-title" className="flex items-center gap-3">
            <Monogram className="h-5 w-auto" />
            <span className="label">Menu</span>
          </h2>
          <button type="button" onClick={onClose} className="-mr-2.5 grid size-11 place-items-center" aria-label="Close menu">
            <CloseIcon className="size-5" />
          </button>
        </div>

        {/* Any link click closes the sheet before navigation. */}
        <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-8" onClick={(e) => (e.target as HTMLElement).closest("a") && onClose()}>
          <ul className="space-y-1">
            {featured.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="display block py-2 text-3xl">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="eyebrow mt-10 mb-3">Categories</p>
          <ul>
            {categories.map((cat) => (
              <li key={cat.slug}>
                <Link href={`/collections/${cat.slug}`} className="flex items-center justify-between border-b border-obsidian/10 py-3.5 text-sm">
                  {cat.name}
                  <span className="text-xs text-taupe">{cat.tagline}</span>
                </Link>
              </li>
            ))}
          </ul>

          <ul className="mt-10 space-y-1">
            {[
              { label: "About", href: "/about" },
              { label: "Account & Wishlist", href: "/account" },
              { label: "Bag", href: "/cart" },
              { label: "Contact", href: "/help/contact" },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="label block py-2.5">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Sheet>
  );
}
