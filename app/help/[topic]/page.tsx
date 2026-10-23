import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { formatINR } from "@/lib/format";
import { policy } from "@/lib/site";

// PLACEHOLDER COPY — every page here is a draft to be replaced with ACT VII's
// reviewed policies and real contact details before launch.
const topics: Record<string, { title: string; body: string[] }> = {
  shipping: {
    title: "Shipping",
    body: [
      `Orders over ${formatINR(policy.freeShippingThreshold)} ship free across India. Orders below that carry a flat ${formatINR(policy.standardShipping)} shipping charge.`,
      "Estimated delivery dates are shown at checkout once your pin code is known.",
    ],
  },
  returns: {
    title: "Returns",
    body: [
      `Unworn pieces with original tags can be returned within ${policy.returnWindowDays} days of delivery.`,
      "To start a return, open your order (from your confirmation email or your account) and choose “Request a return”. Select the pieces and tell us why — we'll review it and email you the next steps, including pickup.",
      "Once your items reach us and pass inspection, we refund the item value. Online payments are refunded to the original payment method, usually within 5–7 working days. For cash-on-delivery orders we refund by bank transfer or UPI.",
      "Shipping charges aren't refunded. Tailored items that have been altered cannot be returned.",
    ],
  },
  privacy: {
    title: "Privacy",
    body: [
      "Your bag is kept in your browser. When you place an order or create an account, we store your name, contact details, delivery addresses, order history and wishlist so we can fulfil orders, handle returns and keep you signed in.",
      "Payments are handled by Razorpay; we never see or store your card or bank details. Order and account emails are sent through our email provider.",
      "A full privacy policy will be published before the store accepts orders.",
    ],
  },
  terms: {
    title: "Terms",
    body: ["Terms of sale will be published before the store accepts orders. Prices shown are in Indian rupees and include GST."],
  },
  contact: {
    title: "Contact",
    body: ["Customer care contact details will be published here before launch."],
  },
};

export function generateStaticParams() {
  return Object.keys(topics).map((topic) => ({ topic }));
}

export async function generateMetadata({ params }: PageProps<"/help/[topic]">): Promise<Metadata> {
  const t = topics[(await params).topic];
  return t ? { title: t.title } : {};
}

export default function HelpPage({ params }: PageProps<"/help/[topic]">) {
  return (
    <div className="shell max-w-3xl py-10 lg:py-16">
      <Suspense fallback={<div aria-busy="true" className="h-64 animate-pulse bg-bone/60" />}>
        <HelpContent params={params} />
      </Suspense>
    </div>
  );
}

async function HelpContent({ params }: { params: PageProps<"/help/[topic]">["params"] }) {
  const t = topics[(await params).topic];
  if (!t) notFound();
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Help" }, { label: t.title }]} />
      <h1 className="display mt-6 text-5xl">{t.title}</h1>
      <div className="mt-8 space-y-4 text-[0.9375rem] leading-relaxed text-graphite">
        {t.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <p className="mt-10 border-t border-obsidian/10 pt-4 text-xs text-taupe">Draft placeholder content for the ACT VII demo store.</p>
    </>
  );
}
