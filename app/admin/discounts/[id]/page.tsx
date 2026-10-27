import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DiscountForm } from "@/components/admin/DiscountForm";
import { requireAdmin } from "@/lib/server/admin";
import { discountState, getDiscount, istInputValue } from "@/lib/server/admin-discounts";

export const metadata: Metadata = { title: "Edit discount code · Admin", robots: { index: false, follow: false } };

export default function EditDiscountPage({ params }: PageProps<"/admin/discounts/[id]">) {
  return (
    <div className="shell max-w-4xl py-10 lg:py-14">
      <Link href="/admin/discounts" className="text-xs text-taupe underline-offset-4 hover:underline">
        ← All discount codes
      </Link>
      <Suspense fallback={<div aria-busy="true" className="mt-6 h-96 animate-pulse bg-bone/60" />}>
        <EditDiscount params={params} />
      </Suspense>
    </div>
  );
}

async function EditDiscount({ params }: { params: PageProps<"/admin/discounts/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const d = await getDiscount(Number(id));
  if (!d) notFound();

  return (
    <>
      <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-4xl tracking-[0.04em] lg:text-5xl">{d.code}</h1>
        <p className="text-xs text-taupe">
          Used {d.used}
          {d.usageLimit != null ? ` of ${d.usageLimit}` : ""} time{d.used === 1 ? "" : "s"} · {discountState(d)}
        </p>
      </div>
      <DiscountForm
        discount={{
          id: d.id,
          code: d.code,
          description: d.description,
          type: d.type,
          value: d.value,
          minSubtotal: d.minSubtotal,
          maxDiscount: d.maxDiscount,
          startsAt: istInputValue(d.startsAt),
          endsAt: istInputValue(d.endsAt),
          usageLimit: d.usageLimit,
          oncePerCustomer: d.oncePerCustomer,
          active: d.active,
        }}
      />
    </>
  );
}
