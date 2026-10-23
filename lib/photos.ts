/**
 * Photo registry — every image on the site is referenced from here.
 *
 * These are PLACEHOLDER photographs from Unsplash (unsplash.com/license:
 * free for commercial use, no attribution required). A shared CSS colour
 * grade (`.photo-grade` in globals.css) unifies their lighting. Replace the
 * `src` values with ACT VII's own photography when it is available.
 */
export type Photo = {
  src: string;
  alt: string;
  /** CSS object-position focal point used when the photo is cropped. */
  position?: string;
};

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}`;

export const photos = {
  // Editorial / campaign
  heroBlackSuit: {
    src: unsplash("1618886614638-80e3c103d31a"),
    alt: "Man in a black suit and black shirt walking past a warm brick facade",
    position: "50% 12%",
  },
  heroDarkSuit: {
    src: unsplash("1519085360753-af0119f7cbe7"),
    alt: "Man in a dark suit with arms folded, standing in low evening light",
    position: "50% 15%",
  },
  heroGreyBlazer: {
    src: unsplash("1555069519-127aadedf1ee"),
    alt: "Man in a stone-grey blazer with window-blind shadows falling across him",
    position: "50% 15%",
  },
  garmentRack: {
    src: unsplash("1445205170230-053b83016050"),
    alt: "Rail of neutral-toned jackets and knitwear in a softly lit atelier",
  },
  shirtDetail: {
    src: unsplash("1602810319428-019690571b5b"),
    alt: "Close-up of shirt collars and fine woven cotton",
  },
  tweedMannequins: {
    src: unsplash("1580657018950-c7f7d6a6d990"),
    alt: "Tweed jackets with pocket squares displayed on tailor's mannequins",
  },
  tweedScarf: {
    src: unsplash("1505022610485-0249ba5b3675"),
    alt: "Man in a brown tweed jacket with a scarf and leather bag strap",
    position: "50% 30%",
  },
  stackedFabrics: {
    src: unsplash("1604176354204-9268737828e4"),
    alt: "Folded stack of denim and knitwear showing texture and weave",
  },
  tieAdjust: {
    src: unsplash("1610652492500-ded49ceeb378"),
    alt: "Man in a charcoal suit adjusting his tie",
    position: "50% 25%",
  },
  suitMannequin: {
    src: unsplash("1598808503746-f34c53b9323e"),
    alt: "Dark tailored suit on a mannequin against exposed brick",
  },

  // Category tiles / products
  whiteShirtMan: {
    src: unsplash("1621072156002-e2fccdc0b176"),
    alt: "Man in a crisp white shirt with sleeves rolled",
    position: "50% 25%",
  },
  blackTrouser: {
    src: unsplash("1584865288642-42078afe6942"),
    alt: "Man in black tapered trousers and a white shirt mid-stride",
    position: "50% 60%",
  },
  doubleBreasted: {
    src: unsplash("1592878849122-facb97520f9e"),
    alt: "Navy double-breasted blazer worn over a burgundy roll neck",
    position: "50% 30%",
  },
  navySweatshirt: {
    src: unsplash("1614975059251-992f11792b9f"),
    alt: "Man in a navy crew-neck knit leaning against a brick wall",
    position: "50% 35%",
  },
  oliveJacket: {
    src: unsplash("1548883354-94bcfe321cbb"),
    alt: "Olive hooded field jacket with flap pockets",
    position: "50% 35%",
  },
  camelBlazer: {
    src: unsplash("1611485988300-b7530defb8e2"),
    alt: "Man in a camel wool blazer over a black roll neck, wearing leather gloves",
    position: "50% 30%",
  },
  whiteShirtsHanging: {
    src: unsplash("1603252109303-2751441dd157"),
    alt: "White cotton shirts hanging on a rail",
  },
  whiteShirtTie: {
    src: unsplash("1598033129183-c4f50c736f10"),
    alt: "Close view of a white dress shirt worn with a dotted tie",
    position: "50% 30%",
  },
  patternShirt: {
    src: unsplash("1596755094514-f87e34085b2c"),
    alt: "Blue cotton shirt with a small woven print on a hanger",
  },
  foldedShirts: {
    src: unsplash("1602810316693-3667c854239a"),
    alt: "Folded white and blue dress shirts",
  },
  checkFlannel: {
    src: unsplash("1611312449412-6cefac5dc3e4"),
    alt: "Grey and black check flannel shirt on a hanger against a dark wall",
  },
  khakiChino: {
    src: unsplash("1473966968600-fa801b869a1a"),
    alt: "Khaki tapered chinos worn with white trainers",
    position: "50% 60%",
  },
  darkDenim: {
    src: unsplash("1624378439575-d8705ad7ae80"),
    alt: "Dark indigo jeans laid flat",
  },
  navySuit: {
    src: unsplash("1507679799987-c73779587ccf"),
    alt: "Man buttoning a navy suit jacket over a white shirt and striped tie",
    position: "50% 30%",
  },
  forestSuit: {
    src: unsplash("1593032465175-481ac7f401a0"),
    alt: "Forest-green two-piece suit with a white pocket square",
    position: "50% 30%",
  },
  blueSuit: {
    src: unsplash("1617137984095-74e4e5e3613f"),
    alt: "Man in a bright navy suit and white shirt",
    position: "50% 25%",
  },
  rustBomber: {
    src: unsplash("1591047139829-d91aecb6caea"),
    alt: "Rust bomber jacket held up on a hanger",
  },
  denimJacket: {
    src: unsplash("1611312449408-fcece27cdbb7"),
    alt: "Indigo denim trucker jacket with a corduroy collar on a hanger",
  },
} satisfies Record<string, Photo>;

export type PhotoKey = keyof typeof photos;
