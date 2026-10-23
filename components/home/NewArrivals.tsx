import Link from "next/link";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { newArrivals } from "@/lib/catalog";
import { getCatalog } from "@/lib/server/catalog";

export async function NewArrivals() {
  const { products } = await getCatalog();
  return (
    <section aria-labelledby="arrivals-title" className="bg-ivory py-16 lg:py-24">
      <div className="shell">
        <div className="mb-8 flex items-end justify-between gap-6 lg:mb-10">
          <div>
            <p className="eyebrow">Just in</p>
            <h2 id="arrivals-title" className="display mt-4 text-4xl sm:text-5xl">
              New Arrivals
            </h2>
          </div>
          <Link href="/collections/new-arrivals" className="label flex shrink-0 items-center gap-2 py-2">
            View all <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
        <ProductGrid products={newArrivals(products).slice(0, 4)} tabletColumns={2} showArrow />
      </div>
    </section>
  );
}
