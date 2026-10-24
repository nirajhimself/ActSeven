import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { formatINR } from "@/lib/format";
import { requireAdmin } from "@/lib/server/admin";
import { listAdminProducts, PRODUCT_STATUSES } from "@/lib/server/admin-products";

export const metadata: Metadata = { title: "Products · Admin", robots: { index: false, follow: false } };

export default function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return (
    <div className="shell py-10 lg:py-14">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-bone/60" />}>
        <Products searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const statusTone: Record<string, string> = {
  active: "bg-[#dfe9dc] text-[#244a2a]",
  draft: "bg-sand/60 text-graphite",
  archived: "bg-bone text-taupe",
};

async function Products({ searchParams }: { searchParams: PageProps<"/admin/products">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (PRODUCT_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const products = await listAdminProducts({ q, status });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="display mt-3 text-5xl">Products</h1>
        </div>
        <Link href="/admin/products/new" className="label inline-flex min-h-11 items-center bg-obsidian px-6 text-ivory hover:bg-graphite">
          New product
        </Link>
      </div>
      <div className="mt-8">
        <AdminNav current="products" />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <nav aria-label="Filter by status" className="flex gap-1 text-xs">
          {[{ label: "All", value: "" }, ...PRODUCT_STATUSES.map((s) => ({ label: s[0].toUpperCase() + s.slice(1), value: s }))].map((t) => (
            <Link
              key={t.label}
              href={t.value ? `/admin/products?status=${t.value}` : "/admin/products"}
              aria-current={(status ?? "") === t.value ? "page" : undefined}
              className={`border px-3 py-2 ${(status ?? "") === t.value ? "border-obsidian" : "border-obsidian/15 text-taupe hover:text-obsidian"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form method="get" action="/admin/products" role="search" className="flex flex-1 gap-2 sm:max-w-sm">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="product-q" className="sr-only">
            Search products
          </label>
          <input id="product-q" name="q" defaultValue={q} placeholder="Name, slug or SKU" className="min-h-10 flex-1 border border-obsidian/20 bg-ivory px-3 text-sm outline-none focus:border-obsidian" />
          <button type="submit" className="label min-h-10 bg-obsidian px-4 text-ivory">
            Search
          </button>
        </form>
      </div>

      {products.length === 0 ? (
        <p className="mt-10 text-sm text-taupe">No products{status || q ? " match these filters" : " yet"}.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-obsidian/20">
                {["", "Product", "Category", "Status", "Variants", "Stock", "Price"].map((h, i) => (
                  <th key={i} scope="col" className={`label py-3 pr-4 font-normal ${h === "Price" || h === "Stock" ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-obsidian/10 hover:bg-bone/50">
                  <td className="w-14 py-2 pr-4">
                    <div className="aspect-[4/5] w-10 overflow-hidden bg-bone">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                        <img src={p.image.url} alt="" className="size-full object-cover" style={{ objectPosition: p.image.position ?? undefined }} />
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/admin/products/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                    <span className="block text-xs text-taupe">
                      /{p.slug}
                      {p.featured ? " · featured" : ""}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{p.category}</td>
                  <td className="py-2 pr-4">
                    <span className={`inline-block px-2 py-0.5 text-xs ${statusTone[p.status] ?? ""}`}>{p.status}</span>
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{p.activeVariants}</td>
                  <td className={`py-2 pr-4 text-right tabular-nums ${p.stock === 0 ? "text-[#8a2a1c]" : ""}`}>{p.stock}</td>
                  <td className="py-2 text-right tabular-nums">{formatINR(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
