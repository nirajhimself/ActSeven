import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private or per-shopper pages.
      disallow: ["/admin", "/account", "/cart", "/checkout", "/orders/", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
