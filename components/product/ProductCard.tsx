import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { Photo } from "@/components/ui/Photo";
import { isSoldOut, priceLabel, type Product } from "@/lib/catalog";
import { Swatches } from "./Swatches";
import { WishlistButton } from "./WishlistButton";

type Props = {
  product: Product;
  sizes?: string;
  showArrow?: boolean;
  headingLevel?: "h2" | "h3";
  /** Above-the-fold cards load their image eagerly (LCP). */
  eager?: boolean;
};

/**
 * The product name link is stretched over the whole card, so the card has a
 * single tab stop for navigation plus the wishlist toggle above it.
 */
export function ProductCard({
  product,
  sizes = "(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw",
  showArrow = false,
  headingLevel: Heading = "h3",
  eager = false,
}: Props) {
  const [primary, secondary] = product.images;
  const soldOut = isSoldOut(product);

  return (
    <article className="group relative">
      <div className="relative aspect-[4/5] overflow-hidden bg-bone">
        <Photo
          photo={primary}
          alt=""
          sizes={sizes}
          eager={eager}
          className="transition-[transform,opacity] duration-700 ease-out group-hover:scale-[1.03]"
        />
        {secondary ? (
          <Photo
            photo={secondary}
            alt=""
            sizes={sizes}
            className="opacity-0 transition-opacity duration-700 group-hover:opacity-100"
          />
        ) : null}
        {soldOut || product.isNew ? (
          <span className="label absolute left-2.5 top-2.5 bg-ivory/90 px-2 py-1 text-[0.5625rem]">
            {soldOut ? "Sold out" : "New"}
          </span>
        ) : null}
        <WishlistButton slug={product.slug} name={product.name} className="absolute right-1 top-1 z-10" />
      </div>

      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <Swatches colours={product.colours} />
          <Heading className="truncate text-xs tracking-wide sm:text-[0.8125rem]">
            <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-1 focus-visible:after:outline-offset-4">
              {product.name}
            </Link>
          </Heading>
          <p className="text-xs font-medium tabular-nums">{priceLabel(product)}</p>
        </div>
        {showArrow ? (
          <ArrowRightIcon className="mt-6 size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
        ) : null}
      </div>
    </article>
  );
}
