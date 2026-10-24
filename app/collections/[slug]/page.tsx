import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CollectionBanner } from "@/components/collection/CollectionBanner";
import { CollectionBrowser } from "@/components/collection/CollectionBrowser";
import { ProductGrid } from "@/components/product/ProductGrid";
import { collectionsFor, productsIn } from "@/lib/collections";
import { getCatalog } from "@/lib/server/catalog";

async function findCollection(slug: string) {
  const { products, categories } = await getCatalog();
  const collection = collectionsFor(categories).find((c) => c.slug === slug);
  return collection ? { collection, items: productsIn(collection, products) } : null;
}

export async function generateStaticParams() {
  const { categories } = await getCatalog();
  return collectionsFor(categories).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const found = await findCollection((await params).slug);
  // Missing: keep the not-found page out of search results (see products/[slug]).
  return found ? { title: found.collection.title, description: found.collection.description } : { title: "Not found", robots: { index: false, follow: false } };
}

// The page itself stays synchronous so its skeleton is part of the prefetched
// shell; the slug is resolved inside Suspense for instant client navigation.
export default function CollectionPage({ params }: PageProps<"/collections/[slug]">) {
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <CollectionContent params={params} />
    </Suspense>
  );
}

function CollectionSkeleton() {
  return (
    <div aria-busy="true">
      <div className="min-h-[17rem] bg-obsidian sm:min-h-[20rem] lg:min-h-[23rem]" />
      <div className="shell grid grid-cols-2 gap-x-3 gap-y-9 py-10 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse bg-bone" />
        ))}
      </div>
    </div>
  );
}

async function CollectionContent({ params }: { params: PageProps<"/collections/[slug]">["params"] }) {
  const found = await findCollection((await params).slug);
  if (!found) notFound();
  const { collection, items } = found;

  return (
    <>
      <CollectionBanner
        title={collection.title}
        description={collection.description}
        photo={collection.banner}
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Collections", href: "/collections" },
          { label: collection.title },
        ]}
      />
      {/* Filters live in the URL, so the browser reads search params on the
          client. The prerendered fallback is the full, unfiltered grid. */}
      <Suspense
        fallback={
          <div className="shell py-8 lg:py-10">
            <p className="mb-6 border-b border-obsidian/10 pb-4 text-xs text-taupe">{items.length} pieces</p>
            <ProductGrid products={items} />
          </div>
        }
      >
        <CollectionBrowser slugs={items.map((p) => p.slug)} showCategory={collection.multiCategory} />
      </Suspense>
    </>
  );
}
