import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DiscountForm } from "@/components/admin/DiscountForm";
import { requireAdmin } from "@/lib/server/admin";

export const metadata: Metadata = { title: "New discount code · Admin", robots: { index: false, follow: false } };

export default function NewDiscountPage() {
  return (
    <div className="shell max-w-4xl py-10 lg:py-14">
      <Link href="/admin/discounts" className="text-xs text-taupe underline-offset-4 hover:underline">
        ← All discount codes
      </Link>
      <Suspense fallback={<div aria-busy="true" className="mt-6 h-96 animate-pulse bg-bone/60" />}>
        <NewDiscount />
      </Suspense>
    </div>
  );
}

async function NewDiscount() {
  await requireAdmin();
  return (
    <>
      <h1 className="display mt-4 mb-8 text-4xl lg:text-5xl">New discount code</h1>
      <DiscountForm
        discount={{
          id: null,
          code: "",
          description: "",
          type: "percentage",
          value: null,
          minSubtotal: 0,
          maxDiscount: null,
          startsAt: "",
          endsAt: "",
          usageLimit: null,
          oncePerCustomer: false,
          active: true,
        }}
      />
    </>
  );
}
