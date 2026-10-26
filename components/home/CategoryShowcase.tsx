import type React from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { Photo } from "@/components/ui/Photo";
import { getCatalog } from "@/lib/server/catalog";

export async function CategoryShowcase() {
  const { categories } = await getCatalog();
  const loop = [...categories, ...categories];
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

      {/*
        Continuous left-to-right rail. The categories are repeated so one loop
        is wider than any screen, then the loop is rendered twice so the track
        can slide by exactly half its width and restart without a seam. Only
        the first set is exposed to assistive tech and keyboard focus.
      */}
      <div
        className="marquee mt-6 py-4"
        style={{ "--marquee-duration": `${loop.length * 6}s` } as React.CSSProperties}
      >
        <ul className="marquee-track flex w-max">
          {[...loop, ...loop].map((cat, i) => {
            const duplicate = i >= categories.length;
            return (
              <li
                key={i}
                aria-hidden={duplicate || undefined}
                data-duplicate={duplicate || undefined}
                className="w-[68vw] shrink-0 pr-3 sm:w-[40vw] md:w-[28vw] lg:w-[19rem] lg:pr-4"
              >
                <Link
                  href={`/collections/${cat.slug}`}
                  tabIndex={duplicate ? -1 : undefined}
                  className="group relative block transition-transform duration-500 ease-out hover:z-10 hover:scale-[1.06] focus-visible:scale-[1.06]"
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-bone shadow-none transition-shadow duration-500 group-hover:shadow-xl">
                    <Photo
                      photo={cat.image}
                      alt=""
                      sizes="(min-width: 1024px) 19rem, (min-width: 768px) 28vw, (min-width: 640px) 40vw, 68vw"
                      className="transition-transform duration-1000 ease-out group-hover:scale-[1.08]"
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
            );
          })}
        </ul>
      </div>

      <div className="shell mt-6 sm:hidden">
        <Link href="/collections/all" className="label inline-flex items-center gap-2 py-2">
          View all <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
