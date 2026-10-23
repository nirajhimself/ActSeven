import type { Metadata } from "next";
import { Suspense } from "react";
import { saveInventoryAction } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/server/admin";
import { isDatabaseConfigured } from "@/lib/server/db";
import { prisma } from "@/lib/server/prisma";

export const metadata: Metadata = { title: "Inventory · Admin", robots: { index: false, follow: false } };

export default function AdminInventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  return (
    <div className="shell py-10 lg:py-14">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-bone/60" />}>
        <Inventory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Live (uncached) stock for every variant, grouped by category and product. */
async function loadStock() {
  return prisma().category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      products: {
        where: { status: { not: "archived" } },
        orderBy: { sortOrder: "asc" },
        include: {
          colours: { orderBy: { sortOrder: "asc" }, include: { colour: true } },
          variants: { include: { size: true, inventory: true } },
        },
      },
    },
  });
}

async function Inventory({ searchParams }: { searchParams: PageProps<"/admin/inventory">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  if (!isDatabaseConfigured()) return <p className="text-sm">Connect a database (DATABASE_URL) to manage inventory.</p>;
  const categories = await loadStock();
  const saved = typeof sp.saved === "string" ? Number(sp.saved) : null;
  const units = categories.flatMap((c) => c.products.flatMap((p) => p.variants)).reduce((n, v) => n + (v.inventory?.quantity ?? 0), 0);

  return (
    <>
      <p className="eyebrow">Admin</p>
      <h1 className="display mt-3 mb-8 text-5xl">Inventory</h1>
      <AdminNav current="inventory" />

      <p className="max-w-2xl text-sm leading-relaxed text-graphite">
        Units on hand for every colour and size ({units.toLocaleString("en-IN")} in total). Changes show on the store as soon as you
        save. Stock is reserved when an order is placed and returned if it&apos;s cancelled, an online payment is abandoned for 30
        minutes, or a return is received with &ldquo;add back to stock&rdquo;.
      </p>
      {saved !== null && Number.isFinite(saved) ? (
        <p role="status" className="mt-4 border border-obsidian/15 bg-bone/60 px-4 py-3 text-sm">
          {saved === 0 ? "No changes to save." : `Saved ${saved} stock ${saved === 1 ? "level" : "levels"}. The store is updated.`}
        </p>
      ) : null}

      <form action={saveInventoryAction} className="mt-8 space-y-12">
        {categories.map((cat) => (
          <section key={cat.slug} aria-labelledby={`inv-${cat.slug}`} className="space-y-6">
            <h2 id={`inv-${cat.slug}`} className="display text-2xl">
              {cat.name}
            </h2>
            {cat.products.map((p) => {
              const sizes = [...new Map(p.variants.map((v) => [v.sizeId, v.size])).values()].sort((a, b) => a.sortOrder - b.sortOrder);
              const total = p.variants.reduce((n, v) => n + (v.inventory?.quantity ?? 0), 0);
              return (
                <div key={p.id} className="overflow-x-auto">
                  <table className="text-left text-sm">
                    <caption className="mb-2 text-left">
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-xs text-taupe">
                        {total} units{p.status !== "active" ? ` · ${p.status}` : ""}
                      </span>
                    </caption>
                    <thead>
                      <tr>
                        <td />
                        {sizes.map((s) => (
                          <th key={s.id} scope="col" className="px-1 pb-1 text-center text-[0.6875rem] font-normal text-taupe">
                            {s.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.colours.map(({ colour }) => (
                        <tr key={colour.id}>
                          <th scope="row" className="pr-4 text-xs font-normal whitespace-nowrap">
                            <span aria-hidden="true" className="mr-2 inline-block size-3 rounded-full align-middle ring-1 ring-obsidian/20" style={{ backgroundColor: colour.hex }} />
                            {colour.name}
                          </th>
                          {sizes.map((s) => {
                            const v = p.variants.find((x) => x.colourId === colour.id && x.sizeId === s.id);
                            if (!v) return <td key={s.id} className="px-1 text-center text-taupe">–</td>;
                            const q = v.inventory?.quantity ?? 0;
                            const threshold = v.inventory?.lowStockThreshold ?? 3;
                            const tone = q === 0 ? "border-[#8a2a1c] bg-[#f3dcd7]/50" : q <= threshold ? "border-[#6a4a12] bg-[#f1e3c8]/50" : "border-obsidian/30";
                            return (
                              <td key={s.id} className="px-1 py-1">
                                <input type="hidden" name={`orig:${v.id}`} value={q} />
                                <input
                                  type="number"
                                  min={0}
                                  max={100000}
                                  required
                                  inputMode="numeric"
                                  name={`stock:${v.id}`}
                                  defaultValue={q}
                                  title={v.sku}
                                  aria-label={`${p.name}, ${colour.name}, size ${s.label} (${v.sku}), units in stock`}
                                  className={`h-10 w-14 border bg-ivory text-center text-sm tabular-nums outline-none focus:border-obsidian ${tone}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>
        ))}
        <div className="sticky bottom-0 -mx-5 border-t border-obsidian/10 bg-ivory/95 px-5 py-4 backdrop-blur md:mx-0 md:px-0">
          <button type="submit" className="label min-h-12 bg-obsidian px-8 text-ivory hover:bg-graphite">
            Save inventory
          </button>
          <span className="ml-4 text-xs text-taupe">Highlighted: red = sold out, amber = at or below the low-stock level.</span>
        </div>
      </form>
    </>
  );
}
