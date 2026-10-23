import Image from "next/image";
import type { Photo as PhotoData } from "@/lib/photos";

type Props = {
  photo: PhotoData;
  /** Responsive `sizes` hint — always set it to match the rendered layout. */
  sizes: string;
  className?: string;
  /** Above-the-fold hero imagery: load eagerly with high fetch priority. */
  eager?: boolean;
  /** Override the photo's own alt, e.g. "" when a caption already describes it. */
  alt?: string;
  quality?: number;
};

/** A graded, cover-cropped photo that fills its (relatively positioned) parent. */
export function Photo({ photo, sizes, className = "", eager = false, alt, quality }: Props) {
  return (
    <Image
      src={photo.src}
      alt={alt ?? photo.alt}
      fill
      sizes={sizes}
      quality={quality}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      className={`photo-grade object-cover ${className}`}
      style={photo.position ? { objectPosition: photo.position } : undefined}
    />
  );
}
