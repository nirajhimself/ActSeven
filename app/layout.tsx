import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { CartDrawer } from "@/components/cart/CartDrawer";
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
    default: "ACT VII — Modern Menswear",
    template: "%s — ACT VII",
  },
  description: "Premium Indian menswear for a more considered you. Refined shirts, tailoring, knitwear and outerwear.",
};

export const viewport: Viewport = {
  themeColor: "#0d0c0a",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Cached (lib/server/catalog.ts), so the layout stays part of the static shell.
  const catalog = await getCatalog();
  return (
    <html lang="en-IN" data-scroll-behavior="smooth" className={`${cormorant.variable} ${jost.variable} antialiased`}>
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
        </CatalogProvider>
      </body>
    </html>
  );
}
