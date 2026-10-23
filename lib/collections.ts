import type { Category, Product } from "./catalog";
import { photos, type Photo } from "./photos";

export type Collection = {
  slug: string;
  title: string;
  description: string;
  banner: Photo;
  /** Show the category filter (only useful when a collection spans categories). */
  multiCategory: boolean;
  match: (p: Product) => boolean;
};

const categoryBanners: Record<string, Photo> = {
  shirts: photos.whiteShirtMan,
  trousers: photos.blackTrouser,
  "suits-blazers": photos.navySuit,
  knitwear: photos.camelBlazer,
  outerwear: photos.tweedScarf,
};

/** Curated collections (rules over product tags) followed by one per category. */
export function collectionsFor(categories: Category[]): Collection[] {
  return [
    {
      slug: "all",
      title: "Shop All",
      description: "The complete ACT VII wardrobe.",
      banner: photos.heroBlackSuit,
      multiCategory: true,
      match: () => true,
    },
    {
      slug: "new-arrivals",
      title: "New Arrivals",
      description: "Recently added to the wardrobe.",
      banner: photos.heroGreyBlazer,
      multiCategory: true,
      match: (p) => Boolean(p.isNew),
    },
    {
      slug: "winter-edit",
      title: "The Winter Edit",
      description: "Layered looks for colder days. Same refined approach.",
      banner: photos.tweedScarf,
      multiCategory: true,
      match: (p) => Boolean(p.campaigns?.includes("winter-edit")),
    },
    {
      slug: "tailoring",
      title: "Tailoring",
      description: "Modern silhouettes. Timeless appeal.",
      banner: photos.tieAdjust,
      multiCategory: true,
      match: (p) => Boolean(p.campaigns?.includes("tailoring")),
    },
    ...categories.map((cat) => ({
      slug: cat.slug,
      title: cat.name,
      description: `${cat.tagline} for every day.`,
      banner: categoryBanners[cat.slug] ?? cat.image,
      multiCategory: false,
      match: (p: Product) => p.category === cat.slug,
    })),
  ];
}

export function productsIn(collection: Collection, products: Product[]) {
  return products.filter(collection.match);
}
