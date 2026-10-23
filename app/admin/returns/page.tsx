import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { formatINR } from "@/lib/format";
import { returnStatusLabel, returnStatusTone, type ReturnStatus } from "@/lib/returns";
import { requireAdmin } from "@/lib/server/admin";
import { isDatabaseConfigured } from "@/lib/server/db";
import { listReturns, returnCountsByStatus } from "@/lib/server/returns";

export const metadata: Metadata = { title: "Returns · Admin", robots: { index: false, follow: false } };

export default function AdminReturnsPage({ searchParams }: PageProps<"/admin/returns">) {
  return (
    <div className="shell py-10 lg:py-14">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-bone/60" />}>
        <AdminReturns searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const STATUSES: ReturnStatus[] = ["requested", "approved", "received", "refunded", "rejected"];
const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

async function AdminReturns({ searchParams }: { searchParams: PageProps<"/admin/returns">["searchParams"] }) {
  await requireAdmin();
  if (!isDatabaseConfigured()) return <p className="text-sm">Connect a database (DATABASE_URL) to see returns.</p>;

  const sp = await searchParams;
  const param = typeof sp.status === "string" ? sp.status : "";
  const status = (STATUSES as string[]).includes(param) ? (param as ReturnStatus) : undefined;
  const [returns, counts] = await Promise.all([listReturns({ status }), returnCountsByStatus()]);
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const tabs = [{ label: "All", value: "", count: total }, ...STATUSES.map((s) => ({ label: returnStatusLabel[s], value: s, count: counts[s] ?? 0 }))];

  return (
    <>
      <p className="eyebrow">Admin</p>
      <h1 className="display mt-3 text-5xl">Returns</h1>
      <div className="mt-8">
        <AdminNav current="returns" />
      </div>
      <nav aria-label="Filter by status" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-obsidian/10">
        {tabs.map((t) => {
          const active = t.value === (status ?? "");
          return (
            <Link
              key={t.label}
              href={t.value ? `/admin/returns?status=${t.value}` : "/admin/returns"}
              aria-current={active ? "page" : undefined}
              className={`-mb-px shrink-0 border-b px-3 py-3 text-xs whitespace-nowrap ${active ? "border-obsidian" : "border-transparent text-taupe hover:text-obsidian"}`}
            >
              {t.label} <span className="text-taupe">({t.count})</span>
            </Link>
          );
        })}
      </nav>

      {returns.length === 0 ? (
        <p className="mt-10 text-sm text-taupe">No returns{status ? " with this status" : " yet"}.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead>
              <tr className="border-b border-obsidian/20">
                {["Order", "Requested", "Customer", "Items", "Reason", "Status", "Value"].map((h) => (
                  <th key={h} scope="col" className={`label py-3 pr-4 font-normal ${h === "Value" ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.id} className="border-b border-obsidian/10 hover:bg-bone/50">
                  <td className="py-3 pr-4 font-medium">
                    <Link href={`/admin/orders/${r.orderId}`} className="underline-offset-4 hover:underline">
                      {r.orderNumber}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-taupe">{dateFmt.format(r.createdAt)}</td>
                  <td className="py-3 pr-4">{r.name}</td>
                  <td className="py-3 pr-4 tabular-nums">{r.itemCount}</td>
                  <td className="py-3 pr-4">{r.reason}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-block px-2 py-0.5 text-xs whitespace-nowrap ${returnStatusTone[r.status]}`}>{returnStatusLabel[r.status]}</span>
                  </td>
                  <td className="py-3 text-right tabular-nums">{formatINR(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
