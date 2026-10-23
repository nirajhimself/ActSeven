import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { isSampleDatabase } from "@/lib/server/db";
import { isRazorpayConfigured } from "@/lib/server/razorpay";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="shell py-8 lg:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Bag", href: "/cart" }, { label: "Checkout" }]} />
      <h1 className="display mt-6 mb-8 text-5xl lg:text-6xl">{isSampleDatabase() ? "Test checkout" : "Checkout"}</h1>
      <CheckoutForm razorpayEnabled={isRazorpayConfigured()} testMode={isSampleDatabase()} />
    </div>
  );
}
