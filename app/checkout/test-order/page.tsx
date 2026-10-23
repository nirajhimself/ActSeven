import type { Metadata } from "next";
import { TestOrderReceipt } from "@/components/checkout/TestOrderReceipt";

export const metadata: Metadata = { title: "Test order", robots: { index: false, follow: false } };

export default function TestOrderPage() {
  return (
    <div className="shell max-w-4xl py-12 lg:py-16">
      <TestOrderReceipt />
    </div>
  );
}
