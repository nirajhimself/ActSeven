import type { MetadataRoute } from "next";
import { collectionsFor } from "@/lib/collections";
import { getCatalog } from "@/lib/server/catalog";
import { legalNav, siteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products, categories } = await getCatalog();
  const page = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" = "weekly") => ({
    url: `${siteUrl}${path}`,
    changeFrequency,
    priority,
  });
  return [
    page("/", 1, "daily"),
    page("/collections", 0.8),
    ...collectionsFor(categories).map((c) => page(`/collections/${c.slug}`, 0.8, "daily")),
    ...products.map((p) => ({ ...page(`/products/${p.slug}`, 0.7), lastModified: new Date(p.addedOn) })),
    page("/about", 0.4, "monthly"),
    ...[...legalNav.map((l) => l.href), "/help/contact"].map((href) => page(href, 0.2, "monthly")),
  ];
}
