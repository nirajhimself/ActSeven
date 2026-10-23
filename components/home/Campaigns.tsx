import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { ArrowRightIcon, PlayIcon } from "@/components/ui/Icons";
import { Photo } from "@/components/ui/Photo";
import { photos } from "@/lib/photos";

export function TailoringPromo() {
  return (
    <section aria-labelledby="tailoring-title" className="relative overflow-hidden bg-obsidian text-ivory">
      <div className="absolute inset-0 lg:right-[38%]">
        <Photo photo={photos.tieAdjust} sizes="(min-width: 1024px) 62vw, 100vw" />
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/50 to-obsidian/10 lg:bg-gradient-to-l lg:from-obsidian lg:from-40% lg:via-obsidian/60 lg:to-transparent" />
      <div className="shell relative flex min-h-[30rem] items-end pb-12 lg:min-h-[34rem] lg:items-center lg:justify-end lg:pb-0">
        <div className="max-w-sm lg:mr-[6%]">
          <p className="text-[0.625rem] tracking-[0.26em] text-gold uppercase">The tailoring edit</p>
          <h2 id="tailoring-title" className="display mt-5 text-5xl lg:text-6xl">
            Tailoring
            <br />
            for today.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-ivory/80">
            Clean lines, easy structure. Half-canvassed suits and soft-shouldered blazers, cut for the way you move.
          </p>
          <ButtonLink href="/collections/tailoring" variant="outline-light" className="mt-8">
            Explore tailoring
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

/**
 * Brand-film teaser. No film has been produced yet, so the play mark is
 * decorative and the section links to the brand story instead.
 */
export function BrandFilm() {
  return (
    <section aria-labelledby="film-title" className="relative overflow-hidden bg-obsidian text-ivory">
      <div className="absolute inset-0">
        <Photo photo={photos.tweedMannequins} sizes="100vw" />
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-obsidian/30 via-obsidian/55 to-obsidian/95" />
      <div className="shell relative grid min-h-[22rem] items-center gap-8 py-14 md:grid-cols-[1fr_auto_1fr] lg:min-h-[26rem]">
        <div className="hidden md:block" />
        <span aria-hidden="true" className="grid size-16 place-items-center justify-self-start rounded-full border border-ivory/60 md:justify-self-center lg:size-20">
          <PlayIcon className="ml-0.5 size-5" />
        </span>
        <div className="md:justify-self-end md:text-right">
          <h2 id="film-title" className="display text-4xl lg:text-5xl">
            For A More
            <br />
            Considered You.
          </h2>
          <p className="mt-4 text-[0.625rem] tracking-[0.22em] text-ivory/70 uppercase">Brand film — coming soon</p>
          <Link href="/about" className="label mt-6 inline-flex items-center gap-2 py-2 text-ivory hover:text-gold">
            Read our story <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
