// PLACEHOLDER POLICY VALUES — confirm shipping and returns terms with the
// business before launch. They are shown to shoppers in the cart and on PDPs.
export const policy = {
  freeShippingThreshold: 699,
  standardShipping: 149,
  returnWindowDays: 15,
  maxQuantityPerLine: 10,
  /** Cash on delivery is offered up to this order total (inclusive). */
  codMaxOrderValue: 10000,
  /** Flat fee added to COD orders. */
  codFee: 0,
} as const;

export const primaryNav = [
  { label: "Shop", href: "/collections/all" },
  { label: "Collections", href: "/collections" },
  { label: "About", href: "/about" },
] as const;

export const footerNav = [
  { label: "Shop", href: "/collections/all" },
  { label: "Collections", href: "/collections" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/help/contact" },
] as const;

export const legalNav = [
  { label: "Privacy", href: "/help/privacy" },
  { label: "Terms", href: "/help/terms" },
  { label: "Shipping", href: "/help/shipping" },
  { label: "Returns", href: "/help/returns" },
] as const;

/** Public origin of the store, e.g. https://actvii.in (set NEXT_PUBLIC_SITE_URL in production). */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
