import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Monogram } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { ReturnRequestForm } from "@/components/order/ReturnRequestForm";
import { formatINR } from "@/lib/format";
import { isReturnWindowOpen, refundStatusLabel, returnableQuantities, returnStatusLabel, returnStatusTone, returnWindowEnds, type Refund } from "@/lib/returns";
import { isDatabaseConfigured } from "@/lib/server/db";
import { getOrder, type Order } from "@/lib/server/orders";
import { listRefunds, listReturnsForOrder } from "@/lib/server/returns";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

export default function OrderPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <div className="shell max-w-4xl py-12 lg:py-16">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-bone/60" />}>
        <OrderContent params={params} />
      </Suspense>
    </div>
  );
}

const statusCopy: Record<Order["status"], { eyebrow: string; title: string; body: (o: Order) => string }> = {
  paid: {
    eyebrow: "Payment received",
    title: "Thank you. Your order is confirmed.",
    body: (o) => `We've received your payment of ${formatINR(o.total)}. We'll send updates to ${o.email}.`,
  },
  cod_confirmed: {
    eyebrow: "Cash on delivery",
    title: "Thank you. Your order is placed.",
    body: (o) => `Please keep ${formatINR(o.total)} ready to pay when it arrives. We'll send updates to ${o.email}.`,
  },
  pending_payment: {
    eyebrow: "Awaiting payment confirmation",
    title: "We're confirming your payment.",
    body: () =>
      "We haven't received confirmation from the payment provider yet. This usually takes a few moments — refresh this page shortly. If you didn't complete payment, you have not been charged.",
  },
  payment_failed: {
    eyebrow: "Payment unsuccessful",
    title: "Your payment didn't go through.",
    body: () => "No payment was taken for this order. You can return to your bag and try again.",
  },
  shipped: {
    eyebrow: "On its way",
    title: "Your order has shipped.",
    body: (o) =>
      o.trackingNumber
        ? `Tracking number ${o.trackingNumber}${o.carrier ? ` with ${o.carrier}` : ""}.`
        : "Your order has left our studio. Tracking details will follow by email.",
  },
  delivered: {
    eyebrow: "Delivered",
    title: "Your order has been delivered.",
    body: () => "We hope every piece earns its place in your wardrobe.",
  },
  expired: {
    eyebrow: "Payment not completed",
    title: "This order expired.",
    body: () => "Payment wasn't completed within 30 minutes, so the items were released. You have not been charged.",
  },
  cancelled: {
    eyebrow: "Cancelled",
    title: "This order was cancelled.",
    body: () => "If you were charged, the amount will be refunded to your original payment method.",
  },
};

async function OrderContent({ params }: { params: PageProps<"/orders/[id]">["params"] }) {
  const { id } = await params;
  if (!isDatabaseConfigured()) notFound();
  const order = await getOrder(id);
  if (!order) notFound();

  const copy = statusCopy[order.status];
  const good = ["paid", "cod_confirmed", "shipped", "delivered"].includes(order.status);
  const placedOn = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(order.createdAt);

  return (
    <>
      <div className="text-center">
        <Monogram className={`mx-auto h-10 w-auto ${good ? "text-gold-deep" : "text-taupe"}`} />
        <p className="eyebrow mt-8">{copy.eyebrow}</p>
        <h1 className="display mt-4 text-4xl sm:text-5xl">{copy.title}</h1>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-graphite">{copy.body(order)}</p>
        <p className="mt-6 text-xs tracking-[0.12em] text-taupe">
          ORDER {order.number} · {placedOn}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {order.status === "pending_payment" ? (
            <a href={`/orders/${order.id}`} className="label inline-flex min-h-11 items-center border border-obsidian/70 px-6 hover:bg-obsidian hover:text-ivory">
              Refresh status
            </a>
          ) : null}
          {order.status === "payment_failed" ? (
            <ButtonLink href="/cart" arrow={false} variant="outline">
              Back to bag
            </ButtonLink>
          ) : null}
          <ButtonLink href="/collections/all">Continue shopping</ButtonLink>
        </div>
      </div>

      <div className="mt-14 grid gap-10 border-t border-obsidian/10 pt-10 md:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="items-title">
          <h2 id="items-title" className="display text-2xl">
            Items
          </h2>
          <ul className="mt-4 divide-y divide-obsidian/10">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-4 py-3 text-sm">
                <div>
                  <Link href={`/products/${item.productSlug}`} className="hover:underline underline-offset-4">
                    {item.productName}
                  </Link>
                  <p className="text-xs text-taupe">
                    {item.colour} / {item.size} · Qty {item.quantity}
                  </p>
                </div>
                <p className="tabular-nums">{formatINR(item.unitPrice * item.quantity)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-obsidian/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatINR(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd className="tabular-nums">{order.shipping ? formatINR(order.shipping) : "Complimentary"}</dd>
            </div>
            {order.codFee ? (
              <div className="flex justify-between">
                <dt>COD fee</dt>
                <dd className="tabular-nums">{formatINR(order.codFee)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-obsidian/10 pt-3 font-medium">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatINR(order.total)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="delivery-title" className="space-y-6 text-sm">
          <div>
            <h2 id="delivery-title" className="display text-2xl">
              Delivery
            </h2>
            <address className="mt-4 leading-relaxed not-italic text-graphite">
              {order.name}
              <br />
              {order.address1}
              {order.address2 ? (
                <>
                  <br />
                  {order.address2}
                </>
              ) : null}
              <br />
              {order.city}, {order.state} {order.pincode}
              <br />
              {order.phone}
            </address>
          </div>
          <div>
            <h3 className="label">Payment</h3>
            <p className="mt-2 text-graphite">{order.paymentMethod === "cod" ? "Cash on delivery" : "Online (Razorpay)"}</p>
          </div>
          {order.giftNote ? (
            <div>
              <h3 className="label">Gift note</h3>
              <p className="mt-2 text-graphite">“{order.giftNote}”</p>
            </div>
          ) : null}
        </section>
      </div>

      <OrderReturns order={order} />
    </>
  );
}

const longDate = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" });

function refundLine(r: Refund) {
  const how =
    r.method === "manual"
      ? `by bank transfer / UPI${r.reference ? ` (ref. ${r.reference})` : ""}`
      : r.status === "processed"
        ? "to your original payment method"
        : "to your original payment method — usually 5–7 working days";
  return r.status === "failed" ? null : `${refundStatusLabel[r.status]}: ${formatINR(r.amount)} ${how}.`;
}

async function OrderReturns({ order }: { order: Order }) {
  await connection();
  const [returns, refunds] = await Promise.all([listReturnsForOrder(order.id), listRefunds(order.id)]);
  const cancelRefunds = refunds.filter((r) => !r.returnId && r.status !== "failed");
  const deadline = order.deliveredAt ? returnWindowEnds(order.deliveredAt) : null;
  const open = order.status === "delivered" && isReturnWindowOpen(order.deliveredAt);
  const left = returnableQuantities(order.items, returns);
  const canReturn = open && order.items.some((i) => left[i.id] > 0);

  if (returns.length === 0 && cancelRefunds.length === 0 && order.status !== "delivered") return null;

  return (
    <section aria-labelledby="returns-title" className="mt-14 border-t border-obsidian/10 pt-10">
      <h2 id="returns-title" className="display text-2xl">
        {cancelRefunds.length && returns.length === 0 ? "Refund" : "Returns"}
      </h2>

      {cancelRefunds.map((r) => (
        <p key={r.id} className="mt-4 text-sm text-graphite">
          {refundLine(r)}
        </p>
      ))}

      {returns.length ? (
        <ul className="mt-5 space-y-5">
          {returns.map((r) => {
            const refund = refunds.find((f) => f.returnId === r.id && f.status !== "failed");
            return (
              <li key={r.id} className="border border-obsidian/10 p-5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className={`px-2.5 py-1 text-xs ${returnStatusTone[r.status]}`}>{returnStatusLabel[r.status]}</span>
                  <span className="text-xs text-taupe">Requested {longDate.format(r.createdAt)}</span>
                </div>
                <ul className="mt-3 text-graphite">
                  {r.items.map((i) => (
                    <li key={i.orderItemId}>
                      {i.productName} <span className="text-xs text-taupe">· {i.size} · Qty {i.quantity}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-taupe">
                  {r.reason} · {formatINR(r.amount)}
                </p>
                {r.status === "requested" ? <p className="mt-3 text-graphite">We&apos;re reviewing your request and will email you the next steps.</p> : null}
                {r.status === "approved" ? (
                  <p className="mt-3 text-graphite">Approved. Please keep the items unworn with their tags — we&apos;ll be in touch to arrange the pickup.</p>
                ) : null}
                {r.status === "received" ? <p className="mt-3 text-graphite">We&apos;ve received your items. Your refund is being prepared.</p> : null}
                {r.adminNote && (r.status === "approved" || r.status === "rejected") ? (
                  <p className="mt-2 text-graphite">“{r.adminNote}”</p>
                ) : null}
                {refund ? <p className="mt-3 text-graphite">{refundLine(refund)}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {canReturn && deadline ? (
        <div className="mt-6">
          <ReturnRequestForm
            orderId={order.id}
            deadline={longDate.format(deadline)}
            items={order.items.map((i) => ({
              id: i.id,
              productName: i.productName,
              colour: i.colour,
              size: i.size,
              unitPrice: i.unitPrice,
              returnable: left[i.id] ?? 0,
            }))}
          />
        </div>
      ) : order.status === "delivered" && deadline && !open ? (
        <p className="mt-4 text-sm text-taupe">The return window for this order closed on {longDate.format(deadline)}.</p>
      ) : null}
    </section>
  );
}
