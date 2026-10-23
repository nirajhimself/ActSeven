import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { Photo } from "@/components/ui/Photo";
import { photos } from "@/lib/photos";

const panels = [
  { title: ["Design", "with purpose."], href: "/about", photo: photos.garmentRack },
  { title: ["Details", "that matter."], href: "/collections/shirts", photo: photos.shirtDetail },
];

export function Philosophy() {
  return (
    <section aria-labelledby="philosophy-title" className="bg-ivory py-16 lg:py-24">
      <div className="shell grid items-center gap-10 lg:grid-cols-[1fr_1.45fr] lg:gap-16">
        <div className="max-w-md">
          <p className="eyebrow">Our philosophy</p>
          <h2 id="philosophy-title" className="display mt-5 text-5xl sm:text-6xl lg:text-[4.25rem]">
            Less, but better.
          </h2>
          <p className="mt-6 text-[0.9375rem] leading-relaxed text-graphite">
            Thoughtful design. Premium fabrics. Versatile pieces. Clothing that stays relevant, season after season.
          </p>
          <ButtonLink href="/about" variant="outline" className="mt-8">
            Our story
          </ButtonLink>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          {panels.map((panel) => (
            <Link key={panel.href} href={panel.href} className="group relative block aspect-[4/5] overflow-hidden bg-graphite text-ivory">
              <Photo
                photo={panel.photo}
                sizes="(min-width: 1024px) 28vw, 48vw"
                className="transition-transform duration-1000 ease-out group-hover:scale-[1.04]"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian/80 via-obsidian/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 sm:p-6">
                <p className="display text-xl leading-tight sm:text-[1.75rem]">
                  {panel.title[0]}
                  <br />
                  {panel.title[1]}
                </p>
                <ArrowRightIcon className="mb-1 size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
