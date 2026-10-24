import Link from "next/link";
import { adminSignOutAction } from "@/app/admin/session-actions";
import { paymentMode } from "@/lib/server/razorpay";

export type AdminSection = "overview" | "orders" | "returns" | "products" | "inventory";

const modeTone = {
  test: "bg-[#f1e3c8] text-[#6a4a12]",
  live: "bg-[#dfe9dc] text-[#244a2a]",
  off: "bg-bone text-taupe",
} as const;

export function AdminNav({ current }: { current: AdminSection }) {
  const items = [
    { key: "overview", href: "/admin", label: "Overview" },
    { key: "orders", href: "/admin/orders", label: "Orders" },
    { key: "returns", href: "/admin/returns", label: "Returns" },
    { key: "products", href: "/admin/products", label: "Products" },
    { key: "inventory", href: "/admin/inventory", label: "Inventory" },
  ] as const;
  const mode = paymentMode();
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-obsidian/10">
      <nav aria-label="Admin" className="no-scrollbar flex gap-6 overflow-x-auto">
        {items.map((i) => (
          <Link
            key={i.key}
            href={i.href}
            aria-current={current === i.key ? "page" : undefined}
            className={`label -mb-px shrink-0 border-b py-3 ${current === i.key ? "border-obsidian" : "border-transparent text-taupe hover:text-obsidian"}`}
          >
            {i.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3 pb-2">
        <span className={`px-2 py-1 text-[0.6875rem] ${modeTone[mode]}`} title="Razorpay key in use">
          Payments: {mode === "test" ? "TEST mode" : mode === "live" ? "LIVE" : "not set up"}
        </span>
        <form action={adminSignOutAction}>
          <button type="submit" className="text-xs underline underline-offset-4 hover:text-gold-deep">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
