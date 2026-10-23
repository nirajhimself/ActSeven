import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AddressBook, ProfileForm, SignOutButton, WishlistSync } from "@/components/account/AccountForms";
import { SignInForm } from "@/components/account/SignInForm";
import { WishlistGrid } from "@/components/product/WishlistGrid";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { formatINR } from "@/lib/format";
import { customerStatusLabel, statusTone } from "@/lib/order-status";
import { getCurrentCustomer, isAuthConfigured } from "@/lib/server/auth";
import { listAddresses, listCustomerOrders } from "@/lib/server/customers";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default function AccountPage() {
  return (
    <div className="shell py-8 lg:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Account" }]} />
      <Suspense fallback={<div aria-busy="true" className="mt-8 h-96 animate-pulse bg-bone/60" />}>
        <AccountContent />
      </Suspense>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32 border-t border-obsidian/10 pt-10">
      <h2 id={`${id}-title`} className="display mb-6 text-3xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

async function AccountContent() {
  if (!isAuthConfigured()) {
    return (
      <>
        <h1 className="display mt-6 text-5xl lg:text-6xl">Account</h1>
        <p className="mt-4 max-w-lg text-sm text-taupe">Sign-in isn&apos;t available yet. Your wishlist and bag are saved on this device.</p>
        {process.env.NODE_ENV === "development" ? (
          <p className="mt-4 max-w-lg border border-gold-deep/40 p-4 text-xs text-taupe">
            <strong className="text-obsidian">Developer note:</strong> accounts need a database. Run{" "}
            <code>npm run dev:local</code> to use a local one, or set <code>DATABASE_URL</code> in <code>.env.local</code>.
          </p>
        ) : null}
        <Section id="wishlist" title="Wishlist">
          <WishlistGrid />
        </Section>
      </>
    );
  }

  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <>
        <h1 className="display mt-6 text-5xl lg:text-6xl">Account</h1>
        <div className="mt-10 grid gap-14 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-20">
          <SignInForm />
          <div>
            <h2 className="display text-3xl">Saved on this device</h2>
            <p className="mt-3 mb-6 text-sm text-taupe">Sign in to keep your wishlist across devices and see your orders.</p>
            <WishlistGrid />
          </div>
        </div>
      </>
    );
  }

  const [orders, addresses] = await Promise.all([listCustomerOrders(customer), listAddresses(customer.id)]);
  const firstName = customer.name?.split(" ")[0];
  const nav = [
    { href: "#orders", label: "Orders" },
    { href: "#wishlist", label: "Wishlist" },
    { href: "#addresses", label: "Addresses" },
    { href: "#profile", label: "Profile" },
  ];

  return (
    <>
      <WishlistSync />
      <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display text-5xl lg:text-6xl">{firstName ? `Welcome, ${firstName}.` : "Your account"}</h1>
          <p className="mt-3 text-sm text-taupe">{customer.email}</p>
        </div>
        <SignOutButton />
      </div>

      <nav aria-label="Account sections" className="no-scrollbar mt-8 mb-10 flex gap-6 overflow-x-auto">
        {nav.map((n) => (
          <a key={n.href} href={n.href} className="label shrink-0 py-2 text-taupe hover:text-obsidian">
            {n.label}
          </a>
        ))}
      </nav>

      <div className="space-y-14">
        <Section id="orders" title="Orders">
          {orders.length === 0 ? (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-taupe">You haven&apos;t placed any orders yet.</p>
              <Link href="/collections/all" className="label inline-flex items-center gap-2 py-2">
                Start shopping <ArrowRightIcon className="size-3.5" />
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-obsidian/10 border-y border-obsidian/10">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-4 sm:grid-cols-[10rem_1fr_auto_auto]">
                    <span className="text-sm font-medium group-hover:underline group-hover:underline-offset-4">{o.number}</span>
                    <span className="text-sm tabular-nums sm:order-last">{formatINR(o.total)}</span>
                    <span className="text-xs text-taupe">
                      {dateFmt.format(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                      {o.trackingNumber ? ` · Tracking ${o.trackingNumber}` : ""}
                    </span>
                    <span className={`justify-self-start px-2 py-0.5 text-xs sm:justify-self-end ${statusTone[o.status]}`}>{customerStatusLabel[o.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="wishlist" title="Wishlist">
          <WishlistGrid />
        </Section>

        <Section id="addresses" title="Addresses">
          <AddressBook addresses={addresses} />
        </Section>

        <Section id="profile" title="Profile">
          <ProfileForm email={customer.email} name={customer.name} phone={customer.phone} />
        </Section>
      </div>
    </>
  );
}
