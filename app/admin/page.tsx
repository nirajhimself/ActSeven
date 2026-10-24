import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { formatINR } from "@/lib/format";
import { statusLabel, statusTone } from "@/lib/order-status";
import { requireAdmin } from "@/lib/server/admin";
import { getOverview } from "@/lib/server/admin-overview";
import { recentAudit } from "@/lib/server/admin-session";
import { recentPaymentEvents } from "@/lib/server/payments";
import { paymentMode } from "@/lib/server/razorpay";

export const metadata: Metadata = { title: "Overview · Admin", robots: { index: false, follow: false } };

export default function AdminOverviewPage() {
  return (
    <div className="shell py-10 lg:py-14">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-bone/60" />}>
        <Overview />
      </Suspense>
    </div>
  );
}

const time = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function Stat({ label, value, href, alert }: { label: string; value: string | number; href?: string; alert?: boolean }) {
  const body = (
    <>
      <span className="block text-xs text-taupe">{label}</span>
      <span className={`display mt-1 block text-3xl tabular-nums ${alert ? "text-[#8a2a1c]" : ""}`}>{value}</span>
    </>
  );
  return href ? (
    <Link href={href} className="block border border-obsidian/10 p-4 hover:border-obsidian/40">
      {body}
    </Link>
  ) : (
    <div className="border border-obsidian/10 p-4">{body}</div>
  );
}

async function Overview() {
  const admin = await requireAdmin();
  const [o, events, audit] = await Promise.all([getOverview(), recentPaymentEvents(6), recentAudit(8)]);
  const mode = paymentMode();

  return (
    <>
      <p className="eyebrow">Admin · signed in as {admin.username}</p>
      <h1 className="display mt-3 text-5xl">Overview</h1>
      <div className="mt-8">
        <AdminNav current="overview" />
      </div>

      {mode !== "test" ? (
        <p className={`mb-6 border px-4 py-3 text-sm ${mode === "live" ? "border-[#244a2a]/30 bg-[#dfe9dc]/40" : "border-[#6a4a12]/30 bg-[#f1e3c8]/40"}`}>
          {mode === "live"
            ? "Payments are LIVE: real money is being taken."
            : "Online payments aren't set up. Add Razorpay TEST keys (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) to take test payments."}
        </p>
      ) : null}

      <section aria-labelledby="today-h">
        <h2 id="today-h" className="label mb-3">
          Today
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Orders placed" value={o.today.orders} href="/admin/orders" />
          <Stat label="Revenue (confirmed)" value={formatINR(o.today.revenue)} />
          <Stat label="To ship" value={o.queue.toShip} href="/admin/orders?status=paid" alert={o.queue.toShip > 0} />
          <Stat label="Awaiting payment" value={o.queue.awaitingPayment} href="/admin/orders?status=pending_payment" />
        </div>
      </section>

      <section aria-labelledby="attention-h" className="mt-8">
        <h2 id="attention-h" className="label mb-3">
          Needs attention
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Return requests" value={o.queue.returnsRequested} href="/admin/returns?status=requested" alert={o.queue.returnsRequested > 0} />
          <Stat label="Failed refunds" value={o.queue.refundsFailed} href="/admin/orders?status=cancelled" alert={o.queue.refundsFailed > 0} />
          <Stat label="Low-stock variants" value={o.stock.low} href="/admin/inventory" />
          <Stat label="Sold-out variants" value={o.stock.soldOut} href="/admin/inventory" />
        </div>
        <p className="mt-3 text-xs text-taupe">
          {o.products.active} active products · {o.products.draft} drafts ·{" "}
          <Link href="/admin/products" className="underline underline-offset-2">
            manage products
          </Link>
        </p>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="label mb-3">
            Recent orders
          </h2>
          {o.recentOrders.length === 0 ? (
            <p className="text-sm text-taupe">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-obsidian/10 text-sm">
              {o.recentOrders.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <Link href={`/admin/orders/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                      {r.number}
                    </Link>
                    <span className="block text-xs text-taupe">
                      {r.name} · {time.format(r.createdAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs whitespace-nowrap ${statusTone[r.status]}`}>{statusLabel[r.status]}</span>
                    <span className="tabular-nums">{formatINR(r.total)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="payments-h">
          <h2 id="payments-h" className="label mb-3">
            Payment notifications
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-taupe">None received yet. They appear once the Razorpay webhook is configured.</p>
          ) : (
            <ul className="divide-y divide-obsidian/10 text-xs">
              {events.map((e) => (
                <li key={e.id} className="py-2">
                  <span className={e.outcome === "rejected" ? "font-medium text-[#8a2a1c]" : ""}>
                    {e.event} · {e.outcome}
                  </span>
                  <span className="ml-2 text-taupe">{time.format(e.receivedAt)}</span>
                  {e.note ? <span className="block text-taupe">{e.note}</span> : null}
                </li>
              ))}
            </ul>
          )}

          <h2 className="label mt-8 mb-3">Recent admin activity</h2>
          {audit.length === 0 ? (
            <p className="text-sm text-taupe">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-obsidian/10 text-xs">
              {audit.map((a) => (
                <li key={String(a.id)} className="py-2">
                  {a.action}
                  {a.targetId ? <span className="text-taupe"> · {a.targetType} {a.targetId.slice(0, 8)}</span> : null}
                  <span className="ml-2 text-taupe">
                    {a.username} · {time.format(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
