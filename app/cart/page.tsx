import type { Metadata } from "next";
import { CartPageView } from "@/components/cart/CartPageView";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { isSampleDatabase } from "@/lib/server/db";

export const metadata: Metadata = { title: "Your Bag" };

export default function CartPage() {
  return (
    <div className="shell py-8 lg:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Bag" }]} />
      <h1 className="display mt-6 mb-8 text-5xl lg:text-6xl">Your Bag</h1>
      <CartPageView testCheckout={isSampleDatabase()} />
    </div>
  );
}
