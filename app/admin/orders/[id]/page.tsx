import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  approveReturnAction,
  cancelOrderAction,
  deliverOrderAction,
  receiveReturnAction,
  refundReturnAction,
  rejectReturnAction,
  retryCancelRefundAction,
  shipOrderAction,
} from "@/app/admin/actions";
import { formatINR } from "@/lib/format";
import { statusLabel, statusTone } from "@/lib/order-status";
import { refundStatusLabel, returnStatusLabel, returnStatusTone, returnWindowEnds, type Refund, type ReturnRequest } from "@/lib/returns";
import { requireAdmin } from "@/lib/server/admin";
import { isDatabaseConfigured } from "@/lib/server/db";
import { getOrder, type Order } from "@/lib/server/orders";
import { prisma } from "@/lib/server/prisma";
import { listRefunds, listReturnsForOrder } from "@/lib/server/returns";

export const metadata: Metadata = { title: "Order · Admin", robots: { index: false, follow: false } };

export default function AdminOrderPage(props: PageProps<"/admin/orders/[id]">) {
  return (
    <div className="shell max-w-5xl py-10 lg:py-14">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-bone/60" />}>
        <AdminOrder params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const messages: Record<string, string> = {
  shipped: "Marked as shipped. The customer will be emailed if email is configured.",
  delivered: "Marked as delivered.",
  cancelled: "Order cancelled and stock returned.",
  "cancelled-refunded": "Order cancelled, stock returned, and a full refund sent through Razorpay (it reaches the customer in 5–7 working days).",
  refunded: "Refund recorded. The customer has been emailed (if email is configured).",
  "refund-failed": "The refund didn't go through.",
  "return-approved": "Return approved. The customer has been emailed (if email is configured).",
  "return-rejected": "Return declined. The customer has been emailed (if email is configured).",
  "return-received": "Return marked as received. You can now refund it.",
  "return-received-restocked": "Return received and the items added back to stock. You can now refund it.",
  invalid: "That change isn't allowed from the current status.",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

async function AdminOrder({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/orders/[id]">["params"];
  searchParams: PageProps<"/admin/orders/[id]">["searchParams"];
}) {
  await requireAdmin();
  if (!isDatabaseConfigured()) notFound();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const order = await getOrder(id);
  if (!order) notFound();
  const msg = typeof sp.msg === "string" ? messages[sp.msg] : undefined;
  const errorDetail = typeof sp.error === "string" ? sp.error.slice(0, 300) : undefined;
  const [returns, refunds, payments] = await Promise.all([
    listReturnsForOrder(order.id),
    listRefunds(order.id),
    prisma().payment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } }),
  ]);

  const canShip = order.status === "paid" || order.status === "cod_confirmed" || order.status === "shipped";
  const canDeliver = order.status === "shipped";
  const canCancel = ["pending_payment", "payment_failed", "paid", "cod_confirmed"].includes(order.status);
  const field = "min-h-11 w-full border border-obsidian/20 bg-ivory px-3 text-sm outline-none focus:border-obsidian";

  return (
    <>
      <Link href="/admin/orders" className="text-xs text-taupe underline-offset-4 hover:underline">
        ← All orders
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="display text-4xl lg:text-5xl">{order.number}</h1>
        <span className={`px-2.5 py-1 text-xs ${statusTone[order.status]}`}>{statusLabel[order.status]}</span>
      </div>
      <p className="mt-2 text-sm text-taupe">
        Placed {dateFmt.format(order.createdAt)} · {order.paymentMethod === "cod" ? "Cash on delivery" : "Online (Razorpay)"}
      </p>

      {msg ? (
        <p role="status" className="mt-6 border border-obsidian/15 bg-bone/60 px-4 py-3 text-sm">
          {msg}
          {errorDetail ? <span className="mt-1 block text-[#8a2a1c]">{errorDetail}</span> : null}
        </p>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-10">
          <section aria-labelledby="items-h">
            <h2 id="items-h" className="display text-2xl">
              Items
            </h2>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {order.items.map((i, n) => (
                  <tr key={n} className="border-b border-obsidian/10">
                    <td className="py-3">
                      {i.productName}
                      <span className="block text-xs text-taupe">
                        {i.colour} / {i.size} · {formatINR(i.unitPrice)} × {i.quantity}
                      </span>
                    </td>
                    <td className="py-3 text-right tabular-nums">{formatINR(i.unitPrice * i.quantity)}</td>
                  </tr>
                ))}
                {order.discountAmount ? (
                  <tr>
                    <td className="pt-3 text-taupe">Discount{order.discountCode ? ` (${order.discountCode})` : ""}</td>
                    <td className="pt-3 text-right tabular-nums">−{formatINR(order.discountAmount)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td className="pt-3 text-taupe">Shipping{order.codFee ? " + COD fee" : ""}</td>
                  <td className="pt-3 text-right tabular-nums">{formatINR(order.shipping + order.codFee)}</td>
                </tr>
                <tr className="font-medium">
                  <td className="pt-2">Total</td>
                  <td className="pt-2 text-right tabular-nums">{formatINR(order.total)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section aria-labelledby="fulfil-h" className="space-y-6">
            <h2 id="fulfil-h" className="display text-2xl">
              Fulfilment
            </h2>
            {canShip ? (
              <form action={shipOrderAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <input type="hidden" name="orderId" value={order.id} />
                <label className="text-xs">
                  Carrier
                  <input name="carrier" defaultValue={order.carrier ?? ""} placeholder="e.g. Delhivery" className={`${field} mt-1.5`} />
                </label>
                <label className="text-xs">
                  Tracking number
                  <input name="tracking" defaultValue={order.trackingNumber ?? ""} className={`${field} mt-1.5`} />
                </label>
                <button type="submit" className="label min-h-11 bg-obsidian px-5 text-ivory hover:bg-graphite">
                  {order.status === "shipped" ? "Update tracking" : "Mark shipped"}
                </button>
              </form>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {canDeliver ? (
                <form action={deliverOrderAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button type="submit" className="label min-h-11 border border-obsidian/70 px-5 hover:bg-obsidian hover:text-ivory">
                    Mark delivered
                  </button>
                </form>
              ) : null}
              {canCancel ? (
                <form action={cancelOrderAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button type="submit" className="label min-h-11 border border-[#8a2a1c]/60 px-5 text-[#8a2a1c] hover:bg-[#8a2a1c] hover:text-ivory">
                    Cancel order
                  </button>
                </form>
              ) : null}
            </div>
            {!canShip && !canDeliver && !canCancel ? <p className="text-sm text-taupe">No further actions for this order.</p> : null}
          </section>

          <ReturnsAndRefunds order={order} returns={returns} refunds={refunds} />
        </div>

        <aside className="space-y-8 text-sm">
          <section>
            <h2 className="label">Customer</h2>
            <p className="mt-2 leading-relaxed">
              {order.name}
              <br />
              <a href={`mailto:${order.email}`} className="underline underline-offset-2">
                {order.email}
              </a>
              <br />
              <a href={`tel:${order.phone}`} className="underline underline-offset-2">
                {order.phone}
              </a>
            </p>
          </section>
          <section>
            <h2 className="label">Ship to</h2>
            <address className="mt-2 leading-relaxed not-italic">
              {order.address1}
              {order.address2 ? (
                <>
                  <br />
                  {order.address2}
                </>
              ) : null}
              <br />
              {order.city}, {order.state} {order.pincode}
            </address>
          </section>
          {order.giftNote ? (
            <section>
              <h2 className="label">Gift note</h2>
              <p className="mt-2">“{order.giftNote}”</p>
            </section>
          ) : null}
          <section>
            <h2 className="label">Payment</h2>
            <dl className="mt-2 space-y-1 text-xs text-graphite">
              <div>Method: {order.paymentMethod === "cod" ? "Cash on delivery" : "Razorpay"}</div>
              {order.razorpayOrderId ? <div className="break-all">Razorpay order: {order.razorpayOrderId}</div> : null}
              {order.razorpayPaymentId ? <div className="break-all">Payment: {order.razorpayPaymentId}</div> : null}
              {order.shippedAt ? <div>Shipped: {dateFmt.format(order.shippedAt)}</div> : null}
              {order.deliveredAt ? <div>Delivered: {dateFmt.format(order.deliveredAt)}</div> : null}
            </dl>
            {payments.length ? (
              <ul className="mt-3 space-y-1 border-t border-obsidian/10 pt-3 text-xs text-graphite">
                {payments.map((p) => (
                  <li key={p.id}>
                    {p.provider === "cod" ? "Cash on delivery" : "Razorpay"} · <strong className="font-medium">{p.status}</strong> ·{" "}
                    <span className="tabular-nums">{formatINR(p.amount)}</span>
                    <span className="block text-taupe">updated {dateFmt.format(p.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <Link href={`/orders/${order.id}`} className="inline-block text-xs underline underline-offset-4">
            View customer page
          </Link>
        </aside>
      </div>
    </>
  );
}

const btn = "label min-h-11 px-5";
const outline = `${btn} border border-obsidian/70 hover:bg-obsidian hover:text-ivory`;
const solid = `${btn} bg-obsidian text-ivory hover:bg-graphite`;
const danger = `${btn} border border-[#8a2a1c]/60 text-[#8a2a1c] hover:bg-[#8a2a1c] hover:text-ivory`;
const field = "min-h-11 w-full border border-obsidian/20 bg-ivory px-3 text-sm outline-none focus:border-obsidian";

function ReturnsAndRefunds({ order, returns, refunds }: { order: Order; returns: ReturnRequest[]; refunds: Refund[] }) {
  const paidOnline = order.paymentMethod === "razorpay" && Boolean(order.razorpayPaymentId);
  const needsCancelRefund =
    order.status === "cancelled" && paidOnline && !refunds.some((r) => !r.returnId && r.status !== "failed");
  const refunded = refunds.filter((r) => r.status !== "failed").reduce((sum, r) => sum + r.amount, 0);

  if (returns.length === 0 && refunds.length === 0 && !needsCancelRefund && order.status !== "delivered") return null;

  return (
    <section aria-labelledby="returns-h" className="space-y-6">
      <h2 id="returns-h" className="display text-2xl">
        Returns &amp; refunds
      </h2>
      {order.deliveredAt && order.status === "delivered" ? (
        <p className="text-xs text-taupe">Return window ends {dateFmt.format(returnWindowEnds(order.deliveredAt))}.</p>
      ) : null}
      {refunded ? (
        <p className="text-sm">
          Refunded so far: <strong className="tabular-nums">{formatINR(refunded)}</strong> of {formatINR(order.total)}
        </p>
      ) : null}

      {needsCancelRefund ? (
        <form action={retryCancelRefundAction} className="flex flex-wrap items-center gap-4 border border-[#8a2a1c]/30 p-4">
          <input type="hidden" name="orderId" value={order.id} />
          <p className="text-sm">This cancelled order was paid online and hasn&apos;t been refunded.</p>
          <button type="submit" className={solid}>
            Refund {formatINR(order.total)}
          </button>
        </form>
      ) : null}

      {returns.length === 0 && order.status === "delivered" ? <p className="text-sm text-taupe">No return requests.</p> : null}

      {returns.map((r) => (
        <article key={r.id} className="space-y-4 border border-obsidian/10 p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={`px-2.5 py-1 text-xs ${returnStatusTone[r.status]}`}>{returnStatusLabel[r.status]}</span>
            <span className="text-xs text-taupe">{dateFmt.format(r.createdAt)}</span>
          </div>
          <ul>
            {r.items.map((i) => (
              <li key={i.orderItemId}>
                {i.productName}{" "}
                <span className="text-xs text-taupe">
                  · {i.colour} / {i.size} · {formatINR(i.unitPrice)} × {i.quantity}
                </span>
              </li>
            ))}
          </ul>
          <p>
            <span className="text-taupe">Reason:</span> {r.reason}
            {r.comment ? <span className="mt-1 block text-graphite">“{r.comment}”</span> : null}
          </p>
          <p>
            <span className="text-taupe">Refund value:</span> <span className="tabular-nums">{formatINR(r.amount)}</span>
            {r.restocked ? <span className="text-taupe"> · items restocked</span> : null}
          </p>
          {r.adminNote ? (
            <p>
              <span className="text-taupe">Note to customer:</span> {r.adminNote}
            </p>
          ) : null}

          {r.status === "requested" || r.status === "approved" ? (
            <form className="space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="returnId" value={r.id} />
              <label className="block text-xs">
                Note to customer <span className="text-taupe">(optional, included in the email)</span>
                <input name="note" maxLength={500} className={`${field} mt-1.5`} />
              </label>
              <div className="flex flex-wrap gap-3">
                {r.status === "requested" ? (
                  <button formAction={approveReturnAction} className={solid}>
                    Approve
                  </button>
                ) : null}
                <button formAction={rejectReturnAction} className={danger}>
                  Decline
                </button>
              </div>
            </form>
          ) : null}

          {r.status === "approved" ? (
            <form action={receiveReturnAction} className="flex flex-wrap items-center gap-4">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="returnId" value={r.id} />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="restock" defaultChecked className="size-4 accent-obsidian" />
                Add items back to stock
              </label>
              <button type="submit" className={outline}>
                Mark items received
              </button>
            </form>
          ) : null}

          {r.status === "received" ? (
            <form action={refundReturnAction} className="space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="returnId" value={r.id} />
              {paidOnline ? (
                <p className="text-xs text-taupe">
                  Refunds {formatINR(r.amount)} to the customer&apos;s original payment method through Razorpay.
                </p>
              ) : (
                <label className="block text-xs">
                  Bank transfer / UPI reference <span className="text-taupe">(pay the customer first, then record it here)</span>
                  <input name="reference" required maxLength={120} className={`${field} mt-1.5`} />
                </label>
              )}
              <button type="submit" className={solid}>
                {paidOnline ? `Refund ${formatINR(r.amount)}` : `Record refund of ${formatINR(r.amount)}`}
              </button>
            </form>
          ) : null}
        </article>
      ))}

      {refunds.length ? (
        <div>
          <h3 className="label">Refund history</h3>
          <ul className="mt-3 divide-y divide-obsidian/10 text-xs">
            {refunds.map((f) => (
              <li key={f.id} className="py-2.5">
                <span className="tabular-nums">{formatINR(f.amount)}</span> · {refundStatusLabel[f.status]} ·{" "}
                {f.method === "razorpay" ? "Razorpay" : "Manual"} · {f.returnId ? "return" : "cancellation"} · {dateFmt.format(f.createdAt)}
                {f.razorpayRefundId ? <span className="block break-all text-taupe">{f.razorpayRefundId}</span> : null}
                {f.reference ? <span className="block text-taupe">Ref. {f.reference}</span> : null}
                {f.error ? <span className="block text-[#8a2a1c]">{f.error}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
