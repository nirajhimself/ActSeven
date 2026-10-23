import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { Photo } from "@/components/ui/Photo";
import { collectionsFor, productsIn } from "@/lib/collections";
import { getCatalog } from "@/lib/server/catalog";

export const metadata: Metadata = {
  title: "Collections",
  description: "Explore the ACT VII collections — tailoring, the Winter Edit, new arrivals and wardrobe essentials.",
};

export default async function CollectionsIndex() {
  const { products, categories } = await getCatalog();
  const [featured, ...rest] = collectionsFor(categories).filter((c) => c.slug !== "all");
  return (
    <div className="shell py-12 lg:py-16">
      <p className="eyebrow">Collections</p>
      <h1 className="display mt-4 text-5xl lg:text-6xl">Explore the wardrobe.</h1>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {[featured, ...rest].map((col, i) => (
          <li key={col.slug} className={i === 0 ? "sm:col-span-2 lg:row-span-2" : ""}>
            <Link href={`/collections/${col.slug}`} className="group relative block h-full min-h-72 overflow-hidden bg-graphite text-ivory">
              <Photo
                photo={col.banner}
                alt=""
                sizes={i === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"}
                className="transition-transform duration-1000 ease-out group-hover:scale-[1.04]"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian/85 via-obsidian/15 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 lg:p-6">
                <div>
                  <h2 className={`display ${i === 0 ? "text-4xl lg:text-5xl" : "text-2xl"}`}>{col.title}</h2>
                  <p className="mt-1 text-xs text-ivory/75">{productsIn(col, products).length} pieces</p>
                </div>
                <ArrowRightIcon className="mb-1 size-4 shrink-0 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
