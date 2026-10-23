import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
