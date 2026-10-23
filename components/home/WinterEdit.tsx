import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Photo } from "@/components/ui/Photo";
import { photos } from "@/lib/photos";

const chapters = [
  { n: "01", label: "Outerwear", href: "/collections/outerwear" },
  { n: "02", label: "Knitwear", href: "/collections/knitwear" },
  { n: "03", label: "Tailoring", href: "/collections/tailoring" },
];

export function WinterEdit() {
  return (
    <section aria-labelledby="winter-title" className="bg-obsidian text-ivory">
      <div className="grid lg:grid-cols-[2.6fr_1fr]">
        <div className="relative min-h-[34rem] overflow-hidden lg:min-h-[40rem]">
          <Photo photo={photos.tweedScarf} sizes="(min-width: 1024px) 72vw, 100vw" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian/90 via-obsidian/30 to-transparent lg:bg-gradient-to-r lg:from-obsidian/85 lg:via-obsidian/30" />
          <div className="relative flex h-full min-h-[34rem] flex-col justify-end px-5 pb-12 md:px-8 lg:min-h-[40rem] lg:justify-center lg:px-14 lg:pb-0">
            <p className="text-[0.625rem] tracking-[0.26em] text-gold uppercase">New collection</p>
            <h2 id="winter-title" className="display mt-5 text-5xl sm:text-6xl lg:text-7xl">
              The
              <br />
              Winter Edit.
            </h2>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-ivory/80">
              Layered looks for colder days. Same refined approach.
            </p>
            <div className="mt-8">
              <ButtonLink href="/collections/winter-edit" variant="outline-light">
                Shop now
              </ButtonLink>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-[22rem] flex-col justify-end overflow-hidden lg:min-h-0">
          <Photo photo={photos.stackedFabrics} sizes="(min-width: 1024px) 28vw, 100vw" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian/90 via-obsidian/20 to-obsidian/10" />
          <nav aria-label="Winter Edit chapters" className="relative p-5 md:p-8">
            <ol className="flex gap-6 text-[0.6875rem] tracking-[0.18em] uppercase">
              {chapters.map((ch) => (
                <li key={ch.n}>
                  <Link href={ch.href} className="group flex flex-col gap-1.5 py-1">
                    <span className="text-gold">{ch.n}</span>
                    <span className="text-ivory/80 underline-offset-4 group-hover:text-ivory group-hover:underline">{ch.label}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>
    </section>
  );
}
