import { BrandFilm, TailoringPromo } from "@/components/home/Campaigns";
import { CategoryShowcase } from "@/components/home/CategoryShowcase";
import { Hero } from "@/components/home/Hero";
import { NewArrivals } from "@/components/home/NewArrivals";
import { Philosophy } from "@/components/home/Philosophy";
import { WinterEdit } from "@/components/home/WinterEdit";
import { photos } from "@/lib/photos";

export default function HomePage() {
  return (
    <>
      <Hero slides={[photos.heroBlackSuit, photos.heroDarkSuit, photos.heroGreyBlazer]} />
      <Philosophy />
      <CategoryShowcase />
      <WinterEdit />
      <NewArrivals />
      <TailoringPromo />
      <BrandFilm />
    </>
  );
}
