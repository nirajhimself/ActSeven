import type { NextConfig } from "next";

/**
 * Content Security Policy. Enforced: a minimal set that can't break the
 * store. Report-only: the full policy, including Razorpay Checkout's script,
 * frames and API — browsers log violations without blocking anything. Once a
 * real test payment shows no violations, move it to Content-Security-Policy
 * (see docs/LAUNCH.md). 'unsafe-inline' scripts are needed because pages are
 * prerendered (nonces would force every page to render per request).
 */
const enforcedCsp = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"].join("; ");
const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com")',
  },
  { key: "Content-Security-Policy", value: enforcedCsp },
  // Dev mode needs eval for fast refresh, so the full policy is checked on production builds only.
  ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp }] : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Placeholder photography is served from Unsplash's CDN, which resizes
    // and re-encodes on the fly. See lib/image-loader.ts.
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",
  },
  // Some browsers request /favicon.ico regardless of <link rel="icon">; serve
  // the same monogram (app/icon.svg) instead of a 404.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
