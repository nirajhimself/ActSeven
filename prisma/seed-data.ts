/**
 * SAMPLE CATALOGUE — seed data for the products, categories and colours
 * tables (moved here from lib/catalog.ts; the app now reads the database).
 * Prices and descriptions are illustrative. `soldOutSizes` / `lowStockSizes`
 * only shape the initial sample stock levels written by prisma/seed.ts.
 */
import { photos, type Photo } from "../lib/photos";

export type SeedColour = { name: string; hex: string };

export type SeedProduct = {
  slug: string;
  name: string;
  category: string;
  price: number;
  colours: SeedColour[];
  sizes: string[];
  soldOutSizes?: string[];
  lowStockSizes?: string[];
  images: Photo[];
  summary: string;
  description: string;
  highlights: string[];
  fabric: string;
  fit: string;
  care: string[];
  styles: ("formal" | "casual" | "tailored" | "relaxed")[];
  isNew?: boolean;
  campaigns?: ("winter-edit" | "tailoring")[];
  addedOn: string;
};

export type SeedCategory = { slug: string; name: string; tagline: string; image: Photo };

export const categories: SeedCategory[] = [
  { slug: "shirts", name: "Shirts", tagline: "Shirts to wear on repeat", image: photos.whiteShirtMan },
  { slug: "trousers", name: "Trousers", tagline: "Easy shapes for every day", image: photos.blackTrouser },
  { slug: "suits-blazers", name: "Suits & Blazers", tagline: "Tailoring, made easy", image: photos.doubleBreasted },
  { slug: "knitwear", name: "Knitwear", tagline: "Soft layers, easy to wear", image: photos.navySweatshirt },
  { slug: "outerwear", name: "Outerwear", tagline: "Ready for the weather", image: photos.oliveJacket },
];

export const colours = {
  white: { name: "White", hex: "#f6f3ec" },
  ecru: { name: "Ecru", hex: "#e3d7c3" },
  sky: { name: "Sky", hex: "#bccbdc" },
  chambray: { name: "Chambray", hex: "#7d93ad" },
  navy: { name: "Navy", hex: "#1e2737" },
  black: { name: "Black", hex: "#141312" },
  charcoal: { name: "Charcoal", hex: "#3a3936" },
  stone: { name: "Stone", hex: "#9c968c" },
  khaki: { name: "Khaki", hex: "#b49c74" },
  olive: { name: "Olive", hex: "#4e4f33" },
  indigo: { name: "Indigo", hex: "#27304a" },
  forest: { name: "Forest", hex: "#2d4537" },
  camel: { name: "Camel", hex: "#b4885a" },
  brown: { name: "Brown", hex: "#5b4332" },
  rust: { name: "Rust", hex: "#94502f" },
} satisfies Record<string, SeedColour>;

/** Size systems, in display order. */
export const TOPS = ["XS", "S", "M", "L", "XL", "XXL"];
export const WAIST = ["28", "30", "32", "34", "36", "38"];
export const CHEST = ["36", "38", "40", "42", "44", "46"];

const shirtCare = ["Machine wash cold, gentle cycle", "Do not tumble dry", "Warm iron on reverse"];
const woolCare = ["Dry clean only", "Steam to refresh between wears", "Store on a shaped hanger"];
const knitCare = ["Hand wash cold or dry clean", "Dry flat in shape", "Do not hang to dry"];

export const products: SeedProduct[] = [
  {
    slug: "classic-oxford-shirt",
    name: "Classic Oxford Shirt",
    category: "shirts",
    price: 2499,
    colours: [colours.white, colours.ecru, colours.sky, colours.navy, colours.black],
    sizes: TOPS,
    lowStockSizes: ["XL"],
    soldOutSizes: ["XS"],
    images: [photos.whiteShirtTie, photos.whiteShirtsHanging, photos.shirtDetail],
    summary: "Refined essentials for every day.",
    description:
      "A classic Oxford shirt in soft cotton, made for everyday wear. Clean and easy — under tailoring or on its own.",
    highlights: ["100% cotton Oxford", "Regular fit", "Pre-washed for softness", "Button-down collar"],
    fabric: "100% long-staple cotton Oxford weave, 140 GSM.",
    fit: "Regular fit. True to size — choose your usual size.",
    care: shirtCare,
    styles: ["formal", "casual"],
    isNew: true,
    addedOn: "2026-10-01",
  },
  {
    slug: "relaxed-linen-shirt",
    name: "Relaxed Linen Shirt",
    category: "shirts",
    price: 2799,
    colours: [colours.white, colours.ecru, colours.olive],
    sizes: TOPS,
    images: [photos.whiteShirtMan, photos.whiteShirtsHanging],
    summary: "Breathable linen with an easy drape.",
    description:
      "Garment-washed linen with a soft hand and relaxed shoulder. Made for warm days and long evenings.",
    highlights: ["100% linen", "Relaxed fit", "Garment washed", "Mother-of-pearl buttons"],
    fabric: "100% linen, 160 GSM, garment washed.",
    fit: "Relaxed fit with a dropped shoulder. Size down for a closer fit.",
    care: shirtCare,
    styles: ["casual", "relaxed"],
    isNew: true,
    addedOn: "2026-09-20",
  },
  {
    slug: "fine-print-cotton-shirt",
    name: "Fine Print Cotton Shirt",
    category: "shirts",
    price: 2699,
    colours: [colours.chambray],
    sizes: TOPS,
    images: [photos.patternShirt],
    summary: "A quiet micro-print on soft chambray.",
    description:
      "A soft chambray-blue cotton with a discreet woven print. Reads as a solid from across the room and rewards a closer look.",
    highlights: ["100% cotton", "Regular fit", "Spread collar"],
    fabric: "100% cotton dobby weave, 120 GSM.",
    fit: "Regular fit. True to size.",
    care: shirtCare,
    styles: ["casual"],
    addedOn: "2026-06-12",
  },
  {
    slug: "poplin-dress-shirt",
    name: "Poplin Dress Shirt",
    category: "shirts",
    price: 2299,
    colours: [colours.white, colours.sky],
    sizes: TOPS,
    lowStockSizes: ["S"],
    images: [photos.foldedShirts, photos.shirtDetail],
    summary: "Crisp two-fold poplin for formal days.",
    description:
      "A crisp, smooth poplin with a structured collar that holds its shape under a tie. The foundation of a formal wardrobe.",
    highlights: ["Two-fold cotton poplin", "Tailored fit", "Cutaway collar", "Single-button cuffs"],
    fabric: "100% two-fold cotton poplin, 110 GSM.",
    fit: "Tailored fit through the chest and waist. Size up if between sizes.",
    care: shirtCare,
    styles: ["formal", "tailored"],
    addedOn: "2026-05-02",
  },
  {
    slug: "heritage-check-flannel",
    name: "Heritage Check Flannel",
    category: "shirts",
    price: 2999,
    colours: [colours.charcoal],
    sizes: TOPS,
    images: [photos.checkFlannel],
    summary: "Brushed flannel for cooler days.",
    description:
      "A brushed cotton flannel in a tonal grey check. Wear it buttoned as a shirt or open as a light layer.",
    highlights: ["Brushed cotton flannel", "Regular fit", "Two chest pockets"],
    fabric: "100% brushed cotton flannel, 200 GSM.",
    fit: "Regular fit with room to layer.",
    care: shirtCare,
    styles: ["casual", "relaxed"],
    campaigns: ["winter-edit"],
    addedOn: "2026-10-10",
  },
  {
    slug: "wide-leg-trouser",
    name: "Wide Leg Trouser",
    category: "trousers",
    price: 2999,
    colours: [colours.black, colours.charcoal, colours.stone],
    sizes: WAIST,
    lowStockSizes: ["34"],
    images: [photos.blackTrouser],
    summary: "A fluid line with a sharp crease.",
    description:
      "High-rise, wide-leg trousers in a fluid, drapey fabric, with a pressed front crease and side adjusters in place of belt loops.",
    highlights: ["Fluid drape", "High rise", "Pressed front crease", "Side adjusters"],
    fabric: "68% polyester, 30% viscose, 2% elastane.",
    fit: "Relaxed through the leg with a high rise. True to waist size.",
    care: woolCare,
    styles: ["formal", "tailored"],
    isNew: true,
    addedOn: "2026-10-05",
  },
  {
    slug: "tapered-cotton-chino",
    name: "Tapered Cotton Chino",
    category: "trousers",
    price: 2499,
    colours: [colours.khaki, colours.olive, colours.navy],
    sizes: WAIST,
    images: [photos.khakiChino],
    summary: "The everyday trouser, refined.",
    description:
      "A mid-rise chino in garment-dyed cotton twill with a gentle taper. Smart enough for the office, easy enough for the weekend.",
    highlights: ["Garment-dyed cotton twill", "Tapered leg", "Hidden stretch"],
    fabric: "98% cotton, 2% elastane twill.",
    fit: "Slim through the thigh, tapered to the ankle.",
    care: shirtCare,
    styles: ["casual"],
    addedOn: "2026-04-18",
  },
  {
    slug: "raw-indigo-denim",
    name: "Raw Indigo Denim",
    category: "trousers",
    price: 3499,
    colours: [colours.indigo],
    sizes: WAIST,
    soldOutSizes: ["28", "38"],
    images: [photos.darkDenim],
    summary: "Deep indigo that fades with you.",
    description:
      "Unwashed indigo denim with a straight leg. It starts dark and stiff, then softens and fades the more you wear it.",
    highlights: ["13.5 oz raw denim", "Straight leg", "Copper rivets"],
    fabric: "100% cotton raw denim, 13.5 oz.",
    fit: "Straight leg, mid rise. Expect slight stretch at the waist with wear.",
    care: ["Wash sparingly, inside out, cold", "Line dry", "Colour will transfer when new"],
    styles: ["casual"],
    addedOn: "2026-03-30",
  },
  {
    slug: "navy-two-piece-suit",
    name: "Navy Two-Piece Suit",
    category: "suits-blazers",
    price: 18999,
    colours: [colours.navy, colours.charcoal],
    sizes: CHEST,
    images: [photos.navySuit, photos.suitMannequin],
    summary: "The suit every wardrobe is built around.",
    description:
      "A single-breasted, two-button suit in a fine worsted wool. Half-canvassed for a natural roll to the lapel.",
    highlights: ["Super 110s worsted wool", "Half-canvas construction", "Notch lapel", "Flat-front trousers"],
    fabric: "100% worsted wool, Super 110s. Viscose lining.",
    fit: "Tailored fit. Choose your chest size; trousers are matched and can be altered.",
    care: woolCare,
    styles: ["formal", "tailored"],
    campaigns: ["tailoring"],
    addedOn: "2026-07-14",
  },
  {
    slug: "forest-wool-suit",
    name: "Forest Wool Suit",
    category: "suits-blazers",
    price: 21999,
    colours: [colours.forest],
    sizes: CHEST,
    images: [photos.forestSuit],
    summary: "A deeper shade for occasions.",
    description:
      "A rich forest-green suit in a soft wool flannel. Unexpected without being loud — at its best at evening weddings and winter dinners.",
    highlights: ["Wool flannel", "Half-canvas construction", "Peak lapel"],
    fabric: "100% wool flannel, 280 GSM.",
    fit: "Tailored fit. True to chest size.",
    care: woolCare,
    styles: ["formal", "tailored"],
    isNew: true,
    campaigns: ["tailoring", "winter-edit"],
    addedOn: "2026-10-12",
  },
  {
    slug: "double-breasted-blazer",
    name: "Double-Breasted Blazer",
    category: "suits-blazers",
    price: 12999,
    colours: [colours.navy, colours.black],
    sizes: CHEST,
    lowStockSizes: ["40"],
    images: [photos.doubleBreasted],
    summary: "Six buttons, one clean line.",
    description:
      "A six-by-two double-breasted blazer with brass-tone buttons. Wear it with a roll neck in winter or a white shirt year-round.",
    highlights: ["Wool hopsack", "Six-by-two button stance", "Patch pockets"],
    fabric: "100% wool hopsack, breathable open weave.",
    fit: "Tailored fit with a strong shoulder.",
    care: woolCare,
    styles: ["tailored", "formal"],
    campaigns: ["tailoring", "winter-edit"],
    addedOn: "2026-08-22",
  },
  {
    slug: "camel-wool-blazer",
    name: "Camel Wool Blazer",
    category: "suits-blazers",
    price: 11999,
    colours: [colours.camel],
    sizes: CHEST,
    images: [photos.camelBlazer],
    summary: "Warm camel for the colder months.",
    description:
      "A soft-shouldered single-breasted blazer in a camel wool-cashmere blend. As at ease over denim as it is over flannel trousers.",
    highlights: ["Wool-cashmere blend", "Soft shoulder", "Unstructured"],
    fabric: "90% wool, 10% cashmere.",
    fit: "Relaxed tailored fit. True to chest size.",
    care: woolCare,
    styles: ["tailored", "relaxed"],
    isNew: true,
    campaigns: ["winter-edit", "tailoring"],
    addedOn: "2026-10-15",
  },
  {
    slug: "stone-textured-blazer",
    name: "Stone Textured Blazer",
    category: "suits-blazers",
    price: 10999,
    colours: [colours.stone],
    sizes: CHEST,
    images: [photos.heroGreyBlazer],
    summary: "Light texture, lighter construction.",
    description:
      "An unlined blazer in a slubbed cotton-linen blend with natural texture. Built for warm-weather tailoring.",
    highlights: ["Cotton-linen blend", "Unlined", "Patch pockets"],
    fabric: "55% linen, 45% cotton.",
    fit: "Regular fit with a natural shoulder.",
    care: woolCare,
    styles: ["tailored", "casual"],
    campaigns: ["tailoring"],
    addedOn: "2026-06-01",
  },
  {
    slug: "merino-crew-neck",
    name: "Merino Crew Neck",
    category: "knitwear",
    price: 4499,
    colours: [colours.navy, colours.charcoal, colours.ecru],
    sizes: TOPS,
    images: [photos.navySweatshirt, photos.stackedFabrics],
    summary: "Fine merino for every layer.",
    description:
      "A fine-gauge crew neck in extra-fine merino. Light enough to wear under a blazer, warm enough to wear alone.",
    highlights: ["Extra-fine merino wool", "Fine 14-gauge knit", "Ribbed trims"],
    fabric: "100% extra-fine merino wool, 18.5 micron.",
    fit: "Regular fit. True to size.",
    care: knitCare,
    styles: ["casual"],
    isNew: true,
    campaigns: ["winter-edit"],
    addedOn: "2026-10-08",
  },
  {
    slug: "fine-gauge-roll-neck",
    name: "Fine Gauge Roll Neck",
    category: "knitwear",
    price: 4999,
    colours: [colours.black, colours.camel],
    sizes: TOPS,
    images: [{ ...photos.camelBlazer, position: "50% 20%" }],
    summary: "The quiet foundation of winter tailoring.",
    description:
      "A slim roll neck in a merino-cashmere blend, designed to sit neatly under tailoring.",
    highlights: ["Merino-cashmere blend", "Slim fit", "Double-layer neck"],
    fabric: "85% merino wool, 15% cashmere.",
    fit: "Slim fit. Size up for a relaxed look.",
    care: knitCare,
    styles: ["tailored"],
    campaigns: ["winter-edit"],
    addedOn: "2026-09-28",
  },
  {
    slug: "tweed-field-jacket",
    name: "Tweed Field Jacket",
    category: "outerwear",
    price: 14999,
    colours: [colours.brown],
    sizes: CHEST,
    images: [photos.tweedScarf, photos.tweedMannequins],
    summary: "Heritage cloth, modern cut.",
    description:
      "A herringbone tweed jacket with a softly structured shoulder and horn buttons. An easy winter layer.",
    highlights: ["Wool herringbone tweed", "Half lined", "Horn buttons"],
    fabric: "100% wool tweed, 480 GSM.",
    fit: "Regular fit with room to layer knitwear.",
    care: woolCare,
    styles: ["tailored", "casual"],
    campaigns: ["winter-edit"],
    addedOn: "2026-09-15",
  },
  {
    slug: "olive-field-parka",
    name: "Olive Field Parka",
    category: "outerwear",
    price: 7999,
    colours: [colours.olive, colours.black],
    sizes: TOPS,
    images: [photos.oliveJacket],
    summary: "Weather-ready, city-appropriate.",
    description:
      "A hooded field parka in water-resistant cotton with four flap pockets. Considered for monsoon and winter alike.",
    highlights: ["Water-resistant finish", "Concealed hood", "Four flap pockets"],
    fabric: "Cotton-nylon blend shell with water-resistant finish.",
    fit: "Relaxed fit. True to size.",
    care: ["Machine wash cold", "Do not tumble dry", "Re-proof as needed"],
    styles: ["casual", "relaxed"],
    isNew: true,
    addedOn: "2026-10-03",
  },
  {
    slug: "rust-suede-bomber",
    name: "Rust Bomber Jacket",
    category: "outerwear",
    price: 6999,
    colours: [colours.rust],
    sizes: TOPS,
    images: [photos.rustBomber],
    summary: "A warm accent for neutral wardrobes.",
    description:
      "A clean bomber in a brushed cotton with ribbed trims and a two-way zip. The one colour a neutral wardrobe needs.",
    highlights: ["Brushed cotton", "Ribbed trims", "Two-way zip"],
    fabric: "100% brushed cotton shell, cupro lining.",
    fit: "Regular fit, cropped at the hip.",
    care: ["Dry clean recommended"],
    styles: ["casual"],
    addedOn: "2026-05-20",
  },
  {
    slug: "indigo-trucker-jacket",
    name: "Indigo Trucker Jacket",
    category: "outerwear",
    price: 5499,
    colours: [colours.indigo],
    sizes: TOPS,
    soldOutSizes: ["XS", "S", "M", "L", "XL", "XXL"],
    images: [photos.denimJacket],
    summary: "Rigid denim with a corduroy collar.",
    description:
      "A classic trucker in rigid indigo denim, finished with a corduroy collar. An easy layer over almost anything.",
    highlights: ["12 oz denim", "Corduroy collar", "Button-flap pockets"],
    fabric: "100% cotton denim, 12 oz.",
    fit: "Regular fit, sits at the hip.",
    care: ["Wash cold, inside out", "Line dry"],
    styles: ["casual"],
    campaigns: ["winter-edit"],
    addedOn: "2026-02-11",
  },
];
