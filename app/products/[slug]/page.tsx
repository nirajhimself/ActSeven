import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProductDetails } from "@/components/product/ProductDetails";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ProductPurchase } from "@/components/product/ProductPurchase";
import { ProductPrice } from "@/components/product/ProductPrice";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ReturnIcon, ThreadIcon, TruckIcon } from "@/components/ui/Icons";
import { findCategory, isSoldOut, priceLabel, priceRange, recommendationsFor } from "@/lib/catalog";
import { formatINR } from "@/lib/format";
import { getCatalog, getLiveStock } from "@/lib/server/catalog";
import { policy, siteUrl } from "@/lib/site";
import type { Product } from "@/lib/catalog";

export async function generateStaticParams() {
  const { products } = await getCatalog();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const [{ slug }, { products }] = await Promise.all([params, getCatalog()]);
  const product = products.find((p) => p.slug === slug);
  // Missing or unpublished: keep the not-found page out of search results
  // (the first request for a new URL can be served with status 200 while streaming).
  if (!product) return { title: "Not found", robots: { index: false, follow: false } };
  return {
    title: product.name,
    description: `${product.summary} ${priceLabel(product)}.`,
    openGraph: { images: [{ url: `${product.images[0].src}?w=1200&auto=format&fit=max` }] },
  };
}

// Synchronous page + Suspense keeps the skeleton in the prefetched shell, so
// client navigation between products is instant.
export default function ProductPage({ params }: PageProps<"/products/[slug]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

function ProductSkeleton() {
  return (
    <div aria-busy="true" className="shell pt-5 pb-14 lg:pt-6">
      <div className="h-4 w-48 animate-pulse bg-bone" />
      <div className="mt-6 grid gap-8 md:grid-cols-[1.1fr_1fr] lg:grid-cols-[1.25fr_1fr] lg:gap-14">
        <div className="aspect-[4/5] animate-pulse bg-bone" />
        <div className="space-y-4">
          <div className="h-12 w-3/4 animate-pulse bg-bone" />
          <div className="h-6 w-24 animate-pulse bg-bone" />
          <div className="h-40 animate-pulse bg-bone/60" />
        </div>
      </div>
    </div>
  );
}

async function ProductContent({ params }: { params: PageProps<"/products/[slug]">["params"] }) {
  const [{ slug }, { products, categories }] = await Promise.all([params, getCatalog()]);
  const product = products.find((p) => p.slug === slug);
  if (!product) notFound();
  const category = findCategory(categories, product.category);
  const recommended = recommendationsFor(products, product);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.variants[0]?.sku ?? product.slug,
    url: `${siteUrl}/products/${product.slug}`,
    description: product.description,
    image: product.images.map((i) => i.src),
    brand: { "@type": "Brand", name: "ACT VII" },
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: priceRange(product).min,
      availability: isSoldOut(product) ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <div className="shell pt-5 pb-14 lg:pt-6 lg:pb-20">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            ...(category ? [{ label: category.name, href: `/collections/${category.slug}` }] : []),
            { label: product.name },
          ]}
        />

        <div className="mt-5 grid gap-8 md:grid-cols-[1.1fr_1fr] lg:mt-6 lg:grid-cols-[1.25fr_1fr] lg:gap-14 xl:gap-20">
          <ProductGallery key={product.slug} images={product.images} name={product.name} />

          <div className="md:sticky md:top-28 md:self-start">
            <h1 className="display text-4xl lg:text-5xl">{product.name}</h1>
            <p className="mt-3 text-lg tabular-nums">
              <ProductPrice product={product} />
              <span className="ml-2 text-xs text-taupe">incl. of all taxes</span>
            </p>
            <p className="mt-2 text-xs text-taupe">No reviews yet</p>
            <p className="mt-5 text-sm leading-relaxed text-graphite">{product.summary}</p>

            <div className="mt-8">
              <Suspense fallback={<ProductPurchase key={product.slug} product={product} />}>
                <LiveProductPurchase key={product.slug} product={product} />
              </Suspense>
            </div>

            <ul className="mt-8 grid grid-cols-1 gap-3 border-t border-obsidian/10 pt-6 text-xs text-graphite sm:grid-cols-3">
              <li className="flex items-center gap-2">
                <ThreadIcon className="size-4 shrink-0" /> {product.highlights[0]}
              </li>
              <li className="flex items-center gap-2">
                <TruckIcon className="size-4 shrink-0" /> Free shipping over {formatINR(policy.freeShippingThreshold)}
              </li>
              <li className="flex items-center gap-2">
                <ReturnIcon className="size-4 shrink-0" /> {policy.returnWindowDays}-day returns
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 lg:mt-20">
          <ProductDetails key={product.slug} product={product} />
        </div>
      </div>

      <section aria-labelledby="recommended-title" className="border-t border-obsidian/10 bg-bone/40 py-14 lg:py-20">
        <div className="shell">
          <h2 id="recommended-title" className="display mb-8 text-3xl lg:text-4xl">
            You may also like
          </h2>
          <ProductGrid products={recommended} tabletColumns={2} />
        </div>
      </section>
    </>
  );
}

/** Streams the purchase panel with live stock; the static shell shows it without stock first. */
async function LiveProductPurchase({ product }: { product: Product }) {
  await connection();
  const stock = await getLiveStock(product.slug).catch(() => null);
  return <ProductPurchase product={product} stock={stock} />;
}
