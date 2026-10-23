import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { Photo } from "@/components/ui/Photo";
import { photos } from "@/lib/photos";

export const metadata: Metadata = {
  title: "About",
  description: "ACT VII makes modern, considered clothing for everyone: fewer, better pieces that work together, season after season.",
};

const principles = [
  { n: "01", title: "Less, but better.", body: "A focused wardrobe of pieces that work together, rather than a collection that chases every season." },
  { n: "02", title: "Cloth first.", body: "We start with the fabric and how it feels to wear, then design each piece around it." },
  { n: "03", title: "Made for everyone.", body: "Easy shapes and clear fit notes, so each piece works across different bodies and styles." },
];

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-obsidian text-ivory">
        <div className="absolute inset-0 md:left-[35%] md:[mask-image:linear-gradient(to_right,transparent,black_35%)]">
          <Photo photo={photos.tweedMannequins} sizes="(min-width: 768px) 65vw, 100vw" eager />
        </div>
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/50 to-obsidian/20 md:bg-none" />
        <div className="shell relative flex min-h-[28rem] flex-col justify-end py-14 lg:min-h-[34rem]">
          <p className="text-[0.625rem] tracking-[0.26em] text-gold uppercase">Our story</p>
          <h1 className="display mt-5 max-w-xl text-5xl lg:text-7xl">For a more considered you.</h1>
        </div>
      </section>

      <section id="craft" className="shell grid gap-12 py-16 lg:grid-cols-[1fr_1.4fr] lg:gap-20 lg:py-24">
        <p className="display text-3xl leading-snug lg:text-4xl">
          ACT VII began with a simple question: what would a wardrobe look like if every piece earned its place?
        </p>
        <div className="space-y-5 text-[0.9375rem] leading-relaxed text-graphite">
          <p>
            We design modern clothing for everyone, with an editor&apos;s restraint — clean lines, quiet colour and the kind of detail you notice
            only up close. Shirts with collars that hold their shape. Trousers that drape. Tailoring that moves with you.
          </p>
          <p>
            The name is a nod to the seventh act: the part of the story that comes after the noise, when what remains is what
            matters.
          </p>
        </div>
      </section>

      <section aria-label="Principles" className="bg-bone/50 py-16 lg:py-24">
        <ol className="shell grid gap-10 md:grid-cols-3">
          {principles.map((p) => (
            <li key={p.n}>
              <span className="text-xs tracking-[0.2em] text-gold-deep">{p.n}</span>
              <h2 className="display mt-3 text-3xl">{p.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-graphite">{p.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="shell flex flex-col items-start gap-6 py-16 lg:py-24">
        <h2 className="display text-4xl">Start with the essentials.</h2>
        <ButtonLink href="/collections/all">Explore the collection</ButtonLink>
      </section>
    </>
  );
}
