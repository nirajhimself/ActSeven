import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatINR } from "@/lib/format";
import { statusLabel, statusTone } from "@/lib/order-status";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/server/admin";
import { expireStalePendingOrders } from "@/lib/server/inventory";
import { isDatabaseConfigured } from "@/lib/server/db";
import { isEmailConfigured } from "@/lib/server/email";
import { listOrders, ORDER_STATUSES, orderCountsByStatus, type OrderStatus } from "@/lib/server/orders";
import { isRazorpayConfigured } from "@/lib/server/razorpay";

export const metadata: Metadata = { title: "Orders · Admin", robots: { index: false, follow: false } };

export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <div className="shell py-10 lg:py-14">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-bone/60" />}>
        <AdminOrders searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

async function AdminOrders({ searchParams }: { searchParams: PageProps<"/admin/orders">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const statusParam = typeof sp.status === "string" ? sp.status : "";
  const status = (ORDER_STATUSES as string[]).includes(statusParam) ? (statusParam as OrderStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";

  const services = [
    { name: "Database", ok: isDatabaseConfigured() },
    { name: "Razorpay", ok: isRazorpayConfigured() },
    { name: "Webhook secret", ok: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET) },
    { name: "Email", ok: isEmailConfigured() },
  ];

  if (!isDatabaseConfigured()) {
    return <p className="text-sm">Connect a database (DATABASE_URL) to see orders.</p>;
  }

  // Keep statuses accurate: release stock from abandoned online payments first.
  await expireStalePendingOrders().catch((e) => console.error("[admin] expire sweep", e));
  const [orders, counts] = await Promise.all([listOrders({ status, q }), orderCountsByStatus()]);
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const tabs: { label: string; value: string; count: number }[] = [
    { label: "All", value: "", count: total },
    ...ORDER_STATUSES.map((s) => ({ label: statusLabel[s], value: s, count: counts[s] ?? 0 })),
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="display mt-3 text-5xl">Orders</h1>
        </div>
        <ul className="flex flex-wrap gap-2 text-[0.6875rem]" aria-label="Service status">
          {services.map((s) => (
            <li key={s.name} className={`px-2.5 py-1 ${s.ok ? "bg-[#dfe9dc] text-[#244a2a]" : "bg-[#f3dcd7] text-[#8a2a1c]"}`}>
              {s.name}: {s.ok ? "connected" : "not set"}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <AdminNav current="orders" />
      </div>
      <nav aria-label="Filter by status" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-obsidian/10">
        {tabs.map((t) => {
          const active = t.value === (status ?? "");
          const href = `/admin/orders${t.value || q ? `?${new URLSearchParams({ ...(t.value ? { status: t.value } : {}), ...(q ? { q } : {}) })}` : ""}`;
          return (
            <Link
              key={t.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px shrink-0 border-b px-3 py-3 text-xs whitespace-nowrap ${active ? "border-obsidian" : "border-transparent text-taupe hover:text-obsidian"}`}
            >
              {t.label} <span className="text-taupe">({t.count})</span>
            </Link>
          );
        })}
      </nav>

      <form method="get" action="/admin/orders" className="mt-6 flex max-w-md gap-2" role="search">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <label htmlFor="admin-q" className="sr-only">
          Search orders
        </label>
        <input
          id="admin-q"
          name="q"
          defaultValue={q}
          placeholder="Order no., name, email or phone"
          className="min-h-11 flex-1 border border-obsidian/20 bg-ivory px-3 text-sm outline-none focus:border-obsidian"
        />
        <button type="submit" className="label min-h-11 bg-obsidian px-5 text-ivory">
          Search
        </button>
      </form>

      {orders.length === 0 ? (
        <p className="mt-10 text-sm text-taupe">No orders{status || q ? " match these filters" : " yet"}.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-obsidian/20">
                {["Order", "Placed", "Customer", "Items", "Payment", "Status", "Total"].map((h) => (
                  <th key={h} scope="col" className={`label py-3 pr-4 font-normal ${h === "Total" ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-obsidian/10 hover:bg-bone/50">
                  <td className="py-3 pr-4 font-medium">
                    <Link href={`/admin/orders/${o.id}`} className="underline-offset-4 hover:underline">
                      {o.number}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-taupe">{dateFmt.format(o.createdAt)}</td>
                  <td className="py-3 pr-4">
                    {o.name}
                    <span className="block text-xs text-taupe">
                      {o.email} · {o.city}
                    </span>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{o.itemCount}</td>
                  <td className="py-3 pr-4">{o.paymentMethod === "cod" ? "COD" : "Online"}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-block px-2 py-0.5 text-xs whitespace-nowrap ${statusTone[o.status]}`}>{statusLabel[o.status]}</span>
                  </td>
                  <td className="py-3 text-right tabular-nums">{formatINR(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
