import Link from "next/link";
import { LogoLockup } from "@/components/brand/Logo";
import type { Category } from "@/lib/catalog";
import { footerNav, legalNav } from "@/lib/site";
import { NewsletterForm } from "./NewsletterForm";

export function Footer({ categories }: { categories: Category[] }) {
  return (
    <footer className="bg-obsidian text-ivory">
      <div className="shell grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1.2fr] lg:items-start lg:gap-16 lg:py-20">
        <Link href="/" aria-label="ACT VII — home" className="justify-self-start">
          <LogoLockup monogramClassName="h-12" wordmarkClassName="h-4" className="gap-3" />
        </Link>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-2">
          <nav aria-label="Footer">
            <ul className="space-y-3">
              {footerNav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-ivory/80 hover:text-ivory">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Categories">
            <ul className="space-y-3">
              {categories.map((cat) => (
                <li key={cat.slug}>
                  <Link href={`/collections/${cat.slug}`} className="text-sm text-ivory/80 hover:text-ivory">
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="md:col-span-2 lg:col-span-1">
          <h2 className="display text-2xl">Stay in the loop.</h2>
          <p className="mt-2 mb-5 text-sm text-taupe-light">New collections, thoughtful notes, and the occasional thing worth sharing. Straight to your inbox.</p>
          <NewsletterForm />
        </div>
      </div>

      <div className="border-t border-ivory/10">
        <div className="shell flex flex-col gap-4 py-6 text-xs text-taupe-light sm:flex-row sm:items-center sm:justify-between">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {legalNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-ivory">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <p>
            © 2026 ACT VII. All rights reserved. Photography: placeholder images via{" "}
            <a href="https://unsplash.com/license" className="underline underline-offset-2 hover:text-ivory" rel="noopener" target="_blank">
              Unsplash
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
