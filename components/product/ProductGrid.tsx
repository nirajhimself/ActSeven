import type { Product } from "@/lib/catalog";
import { ProductCard } from "./ProductCard";

type Props = {
  products: Product[];
  /** Columns at the widest breakpoint. */
  columns?: 3 | 4;
  /** Columns between 768px and 1024px. */
  tabletColumns?: 2 | 3;
  showArrow?: boolean;
  /** How many leading cards load eagerly — set for grids near the top of a page. */
  eagerCount?: number;
};

export function ProductGrid({ products, columns = 4, tabletColumns = 3, showArrow = false, eagerCount = 0 }: Props) {
  const cols = `${tabletColumns === 3 ? "md:grid-cols-3" : "md:grid-cols-2"} ${columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`;
  const sizes =
    columns === 4
      ? `(min-width: 1024px) 22vw, (min-width: 768px) ${tabletColumns === 3 ? 31 : 46}vw, 46vw`
      : `(min-width: 1024px) 26vw, (min-width: 768px) 31vw, 46vw`;
  return (
    <ul className={`grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 ${cols} lg:gap-y-12`}>
      {products.map((product, i) => (
        <li key={product.slug}>
          <ProductCard product={product} sizes={sizes} showArrow={showArrow} eager={i < eagerCount} />
        </li>
      ))}
    </ul>
  );
}
