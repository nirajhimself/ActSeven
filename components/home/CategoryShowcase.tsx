import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { Photo } from "@/components/ui/Photo";
import { getCatalog } from "@/lib/server/catalog";

export async function CategoryShowcase() {
  const { categories } = await getCatalog();
  return (
    <section aria-labelledby="wardrobe-title" className="bg-ivory pb-16 lg:pb-24">
      <div className="shell">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Shop by category</p>
            <h2 id="wardrobe-title" className="display mt-4 text-4xl sm:text-5xl">
              The Modern Wardrobe.
            </h2>
          </div>
          <Link href="/collections/all" className="label hidden shrink-0 items-center gap-2 py-2 sm:flex">
            View all <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* Swipeable rail on small screens, five-up grid on desktop. */}
      <ul className="no-scrollbar mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 md:scroll-px-8 md:px-8 lg:mx-auto lg:grid lg:max-w-[90rem] lg:grid-cols-5 lg:gap-4 lg:overflow-visible lg:px-14">
        {categories.map((cat) => (
          <li key={cat.slug} className="w-[68%] shrink-0 snap-start sm:w-[40%] md:w-[30%] lg:w-auto">
            <Link href={`/collections/${cat.slug}`} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden bg-bone">
                <Photo
                  photo={cat.image}
                  alt=""
                  sizes="(min-width: 1024px) 18vw, (min-width: 768px) 30vw, 68vw"
                  className="transition-transform duration-1000 ease-out group-hover:scale-[1.04]"
                />
              </div>
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm">{cat.name}</h3>
                  <p className="mt-0.5 text-xs text-taupe">{cat.tagline}</p>
                </div>
                <ArrowRightIcon className="mt-0.5 size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="shell mt-6 sm:hidden">
        <Link href="/collections/all" className="label inline-flex items-center gap-2 py-2">
          View all <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
