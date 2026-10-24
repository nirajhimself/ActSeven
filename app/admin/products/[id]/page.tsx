import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductForm } from "@/components/admin/ProductForm";
import { requireAdmin } from "@/lib/server/admin";
import { CAMPAIGNS, getProductForEdit, PRODUCT_STATUSES, productFormOptions, SIZE_SYSTEMS, STYLES } from "@/lib/server/admin-products";

export const metadata: Metadata = { title: "Edit product · Admin", robots: { index: false, follow: false } };

export default function EditProductPage(props: PageProps<"/admin/products/[id]">) {
  return (
    <div className="shell max-w-4xl py-10 lg:py-14">
      <Link href="/admin/products" className="text-xs text-taupe underline-offset-4 hover:underline">
        ← All products
      </Link>
      <Suspense fallback={<div aria-busy="true" className="mt-6 h-96 animate-pulse bg-bone/60" />}>
        <EditProduct params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function EditProduct({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/products/[id]">["params"];
  searchParams: PageProps<"/admin/products/[id]">["searchParams"];
}) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^\d+$/.test(id)) notFound();
  const [product, { categories, colours }] = await Promise.all([getProductForEdit(Number(id)), productFormOptions()]);
  if (!product) notFound();

  // The size range in use (the one most active variants belong to).
  const systems = product.variants.filter((v) => v.active).map((v) => v.size.system);
  const sizeSystem = systems.sort((a, b) => systems.filter((s) => s === b).length - systems.filter((s) => s === a).length)[0] ?? "tops";

  return (
    <>
      <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-4xl lg:text-5xl">{product.name}</h1>
        {product.status === "active" ? (
          <Link href={`/products/${product.slug}`} className="text-xs underline underline-offset-4" target="_blank">
            View in store ↗
          </Link>
        ) : (
          <span className="text-xs text-taupe">Not visible in the store ({product.status})</span>
        )}
      </div>
      {sp.saved ? (
        <p role="status" className="mb-6 border border-obsidian/15 bg-bone/60 px-4 py-3 text-sm">
          Saved. The store updates straight away.
        </p>
      ) : null}
      <ProductForm
        key={product.updatedAt.toISOString()}
        options={{ categories, colours, statuses: PRODUCT_STATUSES, styles: STYLES, campaigns: CAMPAIGNS, sizeSystems: SIZE_SYSTEMS }}
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId,
          price: product.price,
          status: product.status,
          featured: product.featured,
          isNew: product.isNew,
          summary: product.summary,
          description: product.description,
          highlights: product.highlights,
          fabric: product.fabric,
          fit: product.fit,
          care: product.care,
          styles: product.styles,
          campaigns: product.campaigns,
          sizeSystem,
          colourIds: product.colours.map((c) => c.colourId),
          images: product.images.map((i) => ({ url: i.url, alt: i.alt, position: i.position })),
          variants: product.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            colour: v.colour.name,
            hex: v.colour.hex,
            size: v.size.label,
            active: v.active,
            priceOverride: v.priceOverride,
            stock: v.inventory?.quantity ?? 0,
          })),
        }}
      />
    </>
  );
}
