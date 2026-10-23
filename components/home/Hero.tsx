"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { PauseIcon, PlayIcon } from "@/components/ui/Icons";
import { Photo } from "@/components/ui/Photo";
import { pad2 } from "@/lib/format";
import type { Photo as PhotoData } from "@/lib/photos";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";

const SLIDE_MS = 7000;

export function Hero({ slides }: { slides: PhotoData[] }) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const playing = !userPaused && !reducedMotion && !interacting;
  const count = slides.length;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [playing, index, count]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured looks"
      className="relative -mt-16 h-[88svh] max-h-[54rem] min-h-[38rem] overflow-hidden bg-obsidian text-ivory lg:-mt-24 lg:h-[94svh] lg:max-h-[62rem] lg:min-h-[44rem]"
      onPointerEnter={() => setInteracting(true)}
      onPointerLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setInteracting(false)}
    >
      {/* Slides — the image occupies the right two-thirds on desktop. */}
      {slides.map((photo, i) => (
        <div
          key={photo.src}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}`}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-[1200ms] ease-out lg:left-[26%] lg:[mask-image:linear-gradient(to_right,transparent,black_38%)] ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        >
          <Photo photo={photo} sizes="(min-width: 1024px) 70vw, 100vw" eager={i === 0} quality={75} />
        </div>
      ))}

      {/* Legibility scrims */}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/35 to-obsidian/45 lg:hidden" />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 hidden w-[55%] bg-gradient-to-r from-obsidian/80 to-transparent lg:block"
      />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-obsidian/60 to-transparent" />

      {/* Copy */}
      <div className="shell relative flex h-full flex-col justify-end pb-28 lg:justify-center lg:pb-0 lg:pt-24">
        <p className="mb-6 text-[0.625rem] leading-relaxed tracking-[0.26em] text-ivory/70 uppercase">
          Modern menswear
          <br />
          For a more considered you
        </p>
        <h1 className="display text-[3.6rem] font-light sm:text-7xl lg:text-[6.75rem]">
          A Higher
          <br />
          Standard.
        </h1>
        <p className="mt-6 max-w-[16rem] text-sm leading-relaxed text-ivory/80 lg:text-[0.9375rem]">
          Timeless pieces for the everyday you.
        </p>
        <div className="mt-8">
          <ButtonLink href="/collections/all" variant="light">
            Explore collection
          </ButtonLink>
        </div>
      </div>

      {/* Thumbnails (desktop) */}
      <div className="absolute top-1/2 right-6 hidden -translate-y-1/2 flex-col gap-3 lg:flex xl:right-10">
        {slides.map((photo, i) => (
          <button
            key={photo.src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show look ${i + 1} of ${count}`}
            aria-current={i === index}
            className={`relative h-[4.5rem] w-12 overflow-hidden ring-1 transition ${
              i === index ? "ring-ivory" : "opacity-55 ring-ivory/25 hover:opacity-90"
            }`}
          >
            <Image src={photo.src} alt="" fill sizes="48px" className="photo-grade object-cover" style={{ objectPosition: photo.position }} />
          </button>
        ))}
      </div>

      {/* Footer row: counter, progress, pause, scroll cue */}
      <div className="shell absolute inset-x-0 bottom-0 flex items-center justify-between pb-7 text-[0.625rem] tracking-[0.2em] text-ivory/80">
        <div className="flex items-center gap-4">
          <span aria-live={playing ? "off" : "polite"} className="tabular-nums">
            {pad2(index + 1)} / {pad2(count)}
          </span>
          <span aria-hidden="true" className="relative h-px w-20 overflow-hidden bg-ivory/25">
            {playing ? (
              <span
                key={index}
                className="absolute inset-0 origin-left animate-progress bg-ivory"
                style={{ ["--slide-duration" as string]: `${SLIDE_MS}ms` }}
              />
            ) : (
              <span className="absolute inset-0 origin-left bg-ivory" style={{ transform: `scaleX(${(index + 1) / count})` }} />
            )}
          </span>
          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            aria-label={userPaused ? "Play slideshow" : "Pause slideshow"}
            className={`-ml-2 grid size-11 place-items-center ${reducedMotion ? "hidden" : ""}`}
          >
            {userPaused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
          </button>
          <span className="flex gap-1 lg:hidden">
            {slides.map((photo, i) => (
              <button
                key={photo.src}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show look ${i + 1} of ${count}`}
                aria-current={i === index}
                className="grid size-8 place-items-center"
              >
                <span className={`block size-1.5 rounded-full ${i === index ? "bg-ivory" : "bg-ivory/35"}`} />
              </button>
            ))}
          </span>
        </div>
        <span aria-hidden="true" className="hidden items-center gap-3 uppercase sm:flex">
          Scroll <span className="h-px w-8 bg-ivory/60" />
        </span>
      </div>
    </section>
  );
}
