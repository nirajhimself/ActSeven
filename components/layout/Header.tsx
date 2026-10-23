"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LogoLockup } from "@/components/brand/Logo";
import { BagIcon, MenuIcon, SearchIcon, UserIcon } from "@/components/ui/Icons";
import { cartDrawer, cartTotals, resolveLines, useCart } from "@/lib/cart";
import { primaryNav } from "@/lib/site";
import { MobileMenu } from "./MobileMenu";
import { useCatalog } from "@/components/catalog/CatalogProvider";
import { SearchDialog } from "./SearchDialog";

/** Routes whose first section is a dark full-bleed image the header sits over. */
const OVERLAY_ROUTES = new Set(["/"]);

/** Reads the URL. Must render inside <Suspense> (see app/layout.tsx). */
export function HeaderWithPath() {
  return <Header pathname={usePathname()} />;
}

/**
 * `pathname` is null in the Suspense fallback used while a request-time URL
 * resolves: the header then renders solid with no active nav item.
 */
export function Header({ pathname }: { pathname: string | null }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { lines } = useCart();
  const { products } = useCatalog();
  const count = useMemo(() => cartTotals(resolveLines(lines, products)).count, [lines, products]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const overlay = pathname !== null && OVERLAY_ROUTES.has(pathname) && !scrolled;
  // "Shop" owns /collections/all; "Collections" owns the index and every other collection.
  const isActive = (href: string) =>
    pathname === null
      ? false
      : href === "/collections"
      ? pathname === "/collections" || (pathname.startsWith("/collections/") && pathname !== "/collections/all")
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <header
        className={`sticky top-0 z-40 transition-colors duration-500 ${
          overlay
            ? "bg-transparent text-ivory"
            : "border-b border-obsidian/10 bg-ivory/95 text-obsidian backdrop-blur-md"
        }`}
      >
        <div className="shell grid h-16 grid-cols-[1fr_auto_1fr] items-center lg:h-24">
          {/* Left: menu (mobile) / primary nav (desktop) */}
          <div className="flex items-center">
            <button
              type="button"
              className="-ml-2.5 grid size-11 place-items-center lg:hidden"
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <MenuIcon className="size-5" />
            </button>
            <nav aria-label="Primary" className="hidden lg:block">
              <ul className="flex gap-10">
                {primaryNav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className="label py-3 underline-offset-8 hover:underline aria-[current=page]:underline"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Centre: logo */}
          <Link href="/" aria-label="ACT VII — home" className="justify-self-center">
            <LogoLockup monogramClassName="h-6 lg:h-9" wordmarkClassName="h-2.5 lg:h-3.5" className="gap-1.5 lg:gap-2" />
          </Link>

          {/* Right: utilities */}
          <div className="flex items-center justify-end gap-1 lg:gap-8">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-haspopup="dialog"
              className="grid size-11 place-items-center lg:flex lg:size-auto lg:items-center lg:gap-2 lg:py-3"
            >
              <SearchIcon className="size-[1.125rem] lg:size-3.5" />
              <span className="sr-only lg:not-sr-only lg:label">Search</span>
            </button>
            <Link href="/account" className="label hidden items-center gap-2 py-3 lg:flex">
              <UserIcon className="size-3.5" />
              Account
            </Link>
            <button
              type="button"
              onClick={cartDrawer.open}
              aria-haspopup="dialog"
              aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`}
              className="relative -mr-2.5 grid size-11 place-items-center lg:mr-0 lg:flex lg:size-auto lg:items-center lg:gap-2 lg:py-3"
            >
              <BagIcon className="size-[1.125rem] lg:size-3.5" />
              <span className="label hidden lg:inline" aria-hidden="true">
                Bag ({count})
              </span>
              {count > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-gold text-[0.5625rem] font-medium text-obsidian lg:hidden"
                >
                  {count}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
