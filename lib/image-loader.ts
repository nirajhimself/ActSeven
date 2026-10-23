"use client";

type LoaderArgs = { src: string; width: number; quality?: number };

/**
 * Unsplash URLs are resized by their imgix-backed CDN, which also negotiates
 * AVIF/WebP via `auto=format`. Local assets (SVG logos) are returned as-is.
 */
export default function imageLoader({ src, width, quality }: LoaderArgs) {
  if (src.startsWith("https://images.unsplash.com/")) {
    const url = new URL(src);
    url.searchParams.set("auto", "format");
    url.searchParams.set("fit", "max");
    url.searchParams.set("w", String(width));
    url.searchParams.set("q", String(quality ?? 70));
    return url.toString();
  }
  return src;
}
