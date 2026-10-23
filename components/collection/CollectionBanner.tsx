import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";
import { Photo } from "@/components/ui/Photo";
import type { Photo as PhotoData } from "@/lib/photos";

export function CollectionBanner({
  title,
  description,
  photo,
  crumbs,
}: {
  title: string;
  description: string;
  photo: PhotoData;
  crumbs: Crumb[];
}) {
  return (
    <section className="relative overflow-hidden bg-obsidian text-ivory">
      <div className="absolute inset-0 md:left-[30%] md:[mask-image:linear-gradient(to_right,transparent,black_35%)]">
        <Photo photo={photo} sizes="(min-width: 768px) 70vw, 100vw" eager />
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian/90 via-obsidian/40 to-obsidian/30 md:bg-gradient-to-r md:from-obsidian/70 md:via-transparent md:to-transparent" />
      <div className="shell relative flex min-h-[17rem] flex-col justify-between py-6 sm:min-h-[20rem] lg:min-h-[23rem]">
        <Breadcrumbs items={crumbs} tone="light" />
        <div className="mt-16">
          <h1 className="display text-5xl sm:text-6xl lg:text-7xl">{title}</h1>
          <p className="mt-3 max-w-sm text-sm text-ivory/80">{description}</p>
        </div>
      </div>
    </section>
  );
}
