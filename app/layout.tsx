import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartSync } from "@/components/cart/CartSync";
import { CatalogProvider } from "@/components/catalog/CatalogProvider";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { Footer } from "@/components/layout/Footer";
import { Header, HeaderWithPath } from "@/components/layout/Header";
import { Suspense } from "react";
import { getCatalog } from "@/lib/server/catalog";
import { isSampleDatabase } from "@/lib/server/db";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  openGraph: { siteName: "ACT VII", locale: "en_IN", type: "website" },
  title: {
    default: "ACT VII — Modern Clothing",
    template: "%s — ACT VII",
  },
  description: "Contemporary clothing for everyone, from India. Shirts, trousers, tailoring, knitwear and outerwear, thoughtfully chosen.",
};

export const viewport: Viewport = {
  themeColor: "#0d0c0a",
};

/**
 * Development only: some browsers' form autofill (e.g. Microsoft Edge, password
 * managers) stamps an `fdprocessedid` attribute on buttons and inputs before
 * React hydrates, which React reports as a hydration mismatch. This strips
 * those markers until the page has loaded, then stops watching. Production
 * doesn't include it — React doesn't report these there.
 */
const STRIP_AUTOFILL_MARKERS = `(() => {
  const attr = "fdprocessedid";
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) m.target.removeAttribute(attr);
  });
  // Keeps watching: in development, hydration can start well after "load",
  // and extensions keep stamping buttons until then.
  observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: [attr] });
})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Cached (lib/server/catalog.ts), so the layout stays part of the static shell.
  const catalog = await getCatalog();
  return (
    <html lang="en-IN" data-scroll-behavior="smooth" className={`${cormorant.variable} ${jost.variable} antialiased`}>
      {process.env.NODE_ENV === "development" ? (
        <head>
          <script dangerouslySetInnerHTML={{ __html: STRIP_AUTOFILL_MARKERS }} />
        </head>
      ) : null}
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="label sr-only z-50 bg-obsidian px-4 py-3 text-ivory focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <CatalogProvider catalog={catalog}>
          <AnnouncementBar />
          <Suspense fallback={<Header pathname={null} />}>
            <HeaderWithPath />
          </Suspense>
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer categories={catalog.categories} />
          <CartDrawer testCheckout={isSampleDatabase()} />
          <CartSync />
        </CatalogProvider>
      </body>
    </html>
  );
}
