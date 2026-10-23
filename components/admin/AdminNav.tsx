import Link from "next/link";

export function AdminNav({ current }: { current: "orders" | "returns" | "inventory" }) {
  const items = [
    { key: "orders", href: "/admin/orders", label: "Orders" },
    { key: "returns", href: "/admin/returns", label: "Returns" },
    { key: "inventory", href: "/admin/inventory", label: "Inventory" },
  ] as const;
  return (
    <nav aria-label="Admin" className="mb-8 flex gap-6 border-b border-obsidian/10">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={current === i.key ? "page" : undefined}
          className={`label -mb-px border-b py-3 ${current === i.key ? "border-obsidian" : "border-transparent text-taupe hover:text-obsidian"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
