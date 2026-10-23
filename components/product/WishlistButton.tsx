"use client";

import { HeartIcon } from "@/components/ui/Icons";
import { toggleWishlist, useWishlist } from "@/lib/wishlist";

export function WishlistButton({ slug, name, className = "", bordered = false }: {
  slug: string;
  name: string;
  className?: string;
  bordered?: boolean;
}) {
  const saved = useWishlist().includes(slug);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      onClick={() => toggleWishlist(slug)}
      className={`grid size-11 place-items-center transition-colors ${
        bordered ? "border border-obsidian/25 hover:border-obsidian" : "text-obsidian hover:text-gold-deep"
      } ${className}`}
    >
      <HeartIcon filled={saved} className="size-4" />
    </button>
  );
}
