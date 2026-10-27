import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { formatINR } from "@/lib/format";
import { requireAdmin } from "@/lib/server/admin";
import { discountState, listDiscounts, type AdminDiscount } from "@/lib/server/admin-discounts";

export const metadata: Metadata = { title: "Discounts · Admin", robots: { index: false, follow: false } };

export default function AdminDiscountsPage({ searchParams }: PageProps<"/admin/discounts">) {
  return (
    <div className="shell py-10 lg:py-14">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-bone/60" />}>
        <Discounts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const stateTone: Record<ReturnType<typeof discountState>, string> = {
  live: "bg-[#dfe9dc] text-[#244a2a]",
  scheduled: "bg-[#f1e3c8] text-[#6a4a12]",
  "used up": "bg-sand/60 text-graphite",
  expired: "bg-bone text-taupe",
  off: "bg-bone text-taupe",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function offer(d: AdminDiscount) {
  if (d.type === "fixed") return `${formatINR(d.value)} off`;
  return `${d.value}% off${d.maxDiscount ? ` (up to ${formatINR(d.maxDiscount)})` : ""}`;
}

function validity(d: AdminDiscount) {
  if (!d.startsAt && !d.endsAt) return "Always";
  if (d.startsAt && d.endsAt) return `${dateFmt.format(d.startsAt)} – ${dateFmt.format(d.endsAt)}`;
  return d.startsAt ? `From ${dateFmt.format(d.startsAt)}` : `Until ${dateFmt.format(d.endsAt!)}`;
}

async function Discounts({ searchParams }: { searchParams: PageProps<"/admin/discounts">["searchParams"] }) {
  await requireAdmin();
  const [sp, discounts] = await Promise.all([searchParams, listDiscounts()]);
  const saved = typeof sp.saved === "string" ? sp.saved.slice(0, 40) : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="display mt-3 text-5xl">Discounts</h1>
        </div>
        <Link href="/admin/discounts/new" className="label inline-flex min-h-11 items-center bg-obsidian px-6 text-ivory hover:bg-graphite">
          New code
        </Link>
      </div>
      <div className="mt-8">
        <AdminNav current="discounts" />
      </div>

      {saved ? (
        <p role="status" className="mb-6 border border-obsidian/15 bg-bone/60 px-4 py-3 text-sm">
          Saved {saved}. Checkout uses the new settings straight away.
        </p>
      ) : null}

      {discounts.length === 0 ? (
        <p className="text-sm text-taupe">No discount codes yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-obsidian/20">
                <th className="py-3 pr-4 font-normal text-taupe">Code</th>
                <th className="py-3 pr-4 font-normal text-taupe">Offer</th>
                <th className="py-3 pr-4 font-normal text-taupe">Minimum spend</th>
                <th className="py-3 pr-4 font-normal text-taupe">Valid</th>
                <th className="py-3 pr-4 font-normal text-taupe">Used</th>
                <th className="py-3 font-normal text-taupe">Status</th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => {
                const state = discountState(d);
                return (
                  <tr key={d.id} className="border-b border-obsidian/10 align-top">
                    <td className="py-3 pr-4">
                      <Link href={`/admin/discounts/${d.id}`} className="font-medium tracking-[0.06em] underline-offset-4 hover:underline">
                        {d.code}
                      </Link>
                      <span className="mt-0.5 block max-w-xs text-xs text-taupe">{d.description}</span>
                    </td>
                    <td className="py-3 pr-4">
                      {offer(d)}
                      {d.oncePerCustomer ? <span className="block text-xs text-taupe">Once per customer</span> : null}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{d.minSubtotal ? formatINR(d.minSubtotal) : "—"}</td>
                    <td className="py-3 pr-4">{validity(d)}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {d.used}
                      {d.usageLimit != null ? ` / ${d.usageLimit}` : ""}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 text-xs ${stateTone[state]}`}>{state[0].toUpperCase() + state.slice(1)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-6 max-w-2xl text-xs text-taupe">
        One code per order. Discounts come off products only (not shipping), and free shipping is judged on the total after the discount. A
        cancelled or expired order gives its use back.
      </p>
    </>
  );
}
