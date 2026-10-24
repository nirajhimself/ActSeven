import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProductForm } from "@/components/admin/ProductForm";
import { requireAdmin } from "@/lib/server/admin";
import { CAMPAIGNS, PRODUCT_STATUSES, productFormOptions, SIZE_SYSTEMS, STYLES } from "@/lib/server/admin-products";

export const metadata: Metadata = { title: "New product · Admin", robots: { index: false, follow: false } };

export default function NewProductPage() {
  return (
    <div className="shell max-w-4xl py-10 lg:py-14">
      <Link href="/admin/products" className="text-xs text-taupe underline-offset-4 hover:underline">
        ← All products
      </Link>
      <h1 className="display mt-4 mb-8 text-4xl lg:text-5xl">New product</h1>
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-bone/60" />}>
        <NewProduct />
      </Suspense>
    </div>
  );
}

async function NewProduct() {
  await requireAdmin();
  const { categories, colours } = await productFormOptions();
  return (
    <ProductForm
      options={{ categories, colours, statuses: PRODUCT_STATUSES, styles: STYLES, campaigns: CAMPAIGNS, sizeSystems: SIZE_SYSTEMS }}
      product={{
        id: null,
        name: "",
        slug: "",
        categoryId: null,
        price: null,
        status: "draft",
        featured: false,
        isNew: true,
        summary: "",
        description: "",
        highlights: [],
        fabric: "",
        fit: "",
        care: [],
        styles: [],
        campaigns: [],
        sizeSystem: "tops",
        colourIds: [],
        images: [],
        variants: [],
      }}
    />
  );
}
