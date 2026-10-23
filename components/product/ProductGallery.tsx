"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { Photo } from "@/lib/photos";

/**
 * Desktop: vertical thumbnails beside a large image.
 * Mobile: a swipeable scroll-snap strip with position dots.
 */
export function ProductGallery({ images, name }: { images: Photo[]; name: string }) {
  const [active, setActive] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const many = images.length > 1;

  const goTo = (i: number) => {
    setActive(i);
    const strip = stripRef.current;
    if (strip) strip.scrollTo({ left: strip.clientWidth * i, behavior: "smooth" });
  };

  return (
    <div className={`grid gap-3 ${many ? "lg:grid-cols-[4.5rem_1fr] lg:gap-4" : ""}`}>
      {many ? (
        <ul className="order-2 hidden gap-3 lg:order-1 lg:flex lg:flex-col" aria-label="Product images">
          {images.map((img, i) => (
            <li key={img.src}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-current={i === active}
                className={`relative block aspect-[4/5] w-full overflow-hidden bg-bone ring-1 transition ${
                  i === active ? "ring-obsidian" : "opacity-60 ring-transparent hover:opacity-100"
                }`}
              >
                <Image src={img.src} alt="" fill sizes="72px" className="photo-grade object-cover" style={{ objectPosition: img.position }} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="order-1 lg:order-2">
        <div
          ref={stripRef}
          className="no-scrollbar -mx-5 flex snap-x snap-mandatory overflow-x-auto md:mx-0 lg:overflow-hidden"
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / el.clientWidth);
            if (i !== active) setActive(i);
          }}
        >
          {images.map((img, i) => (
            <div key={img.src} className="relative aspect-[4/5] w-full shrink-0 snap-center overflow-hidden bg-bone">
              <Image
                src={img.src}
                alt={i === 0 ? `${name} — ${img.alt}` : img.alt}
                fill
                sizes="(min-width: 1024px) 45vw, 100vw"
                quality={75}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : undefined}
                className="photo-grade object-cover"
                style={{ objectPosition: img.position }}
              />
            </div>
          ))}
        </div>
        {many ? (
          <div className="mt-3 flex justify-center gap-1 lg:hidden">
            {images.map((img, i) => (
              <button
                key={img.src}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-current={i === active}
                className="grid size-8 place-items-center"
              >
                <span className={`block h-px w-5 ${i === active ? "bg-obsidian" : "bg-obsidian/25"}`} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
