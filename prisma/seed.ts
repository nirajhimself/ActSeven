/**
 * Seeds sample data. Safe to run repeatedly (`npm run db:seed`):
 * catalogue rows are upserted by slug / name / SKU, and existing stock levels
 * are left alone so a re-seed never wipes real inventory counts.
 *
 *   SEED_RESET_STOCK=1     also reset stock to the sample levels
 *   SEED_SAMPLE_ORDERS=1   add sample customers and orders (always on for a
 *                          local database, never on by default elsewhere)
 *
 * Sample customers use @example.com addresses, which can't receive mail.
 */
import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { categories, CHEST, colours, products, TOPS, WAIST } from "./seed-data";

const url = process.env.DATABASE_URL;
if (!url || url.includes("YOUR_PASSWORD")) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}
const local = ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } }),
});

const sizeSystems = [
  { system: "tops", labels: TOPS },
  { system: "waist", labels: WAIST },
  { system: "chest", labels: CHEST },
];

/** Deterministic 0..1 from a string, so sample stock is stable between runs. */
const unit = (s: string) => createHash("sha256").update(s).digest().readUInt32BE(0) / 0xffffffff;

function sampleStock(sku: string, size: string, colourIndex: number, p: (typeof products)[number]) {
  if (p.soldOutSizes?.includes(size)) return 0;
  if (p.lowStockSizes?.includes(size)) return 1 + Math.floor(unit(sku) * 3); // 1–3
  const base = colourIndex === 0 ? 10 : 4; // the lead colourway is stocked deeper
  return base + Math.floor(unit(sku) * 12);
}

async function seedCatalogue() {
  for (const [i, c] of categories.entries()) {
    const data = { name: c.name, tagline: c.tagline, imageUrl: c.image.src, imageAlt: c.image.alt, imagePosition: c.image.position ?? null, sortOrder: i };
    await prisma.category.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...data }, update: data });
  }
  for (const c of Object.values(colours)) {
    await prisma.colour.upsert({ where: { name: c.name }, create: c, update: { hex: c.hex } });
  }
  for (const { system, labels } of sizeSystems) {
    for (const [i, label] of labels.entries()) {
      await prisma.size.upsert({
        where: { system_label: { system, label } },
        create: { system, label, sortOrder: i },
        update: { sortOrder: i },
      });
    }
  }

  const categoryIds = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  const colourIds = new Map((await prisma.colour.findMany()).map((c) => [c.name, c.id]));
  const sizeIds = new Map((await prisma.size.findMany()).map((s) => [`${s.system}:${s.label}`, s.id]));
  const resetStock = process.env.SEED_RESET_STOCK === "1";
  let variantCount = 0;
  let stockRows = 0;

  for (const [i, p] of products.entries()) {
    const system = sizeSystems.find((s) => s.labels === p.sizes)?.system;
    if (!system) throw new Error(`${p.slug}: sizes must be one of TOPS, WAIST or CHEST`);
    const fields = {
      name: p.name,
      categoryId: categoryIds.get(p.category)!,
      price: p.price,
      summary: p.summary,
      description: p.description,
      highlights: p.highlights,
      fabric: p.fabric,
      fit: p.fit,
      care: p.care,
      styles: p.styles,
      campaigns: p.campaigns ?? [],
      isNew: Boolean(p.isNew),
      addedOn: new Date(`${p.addedOn}T00:00:00Z`),
      sortOrder: i,
    };
    const product = await prisma.product.upsert({ where: { slug: p.slug }, create: { slug: p.slug, ...fields }, update: fields });

    await prisma.$transaction([
      prisma.productColour.deleteMany({ where: { productId: product.id } }),
      prisma.productColour.createMany({
        data: p.colours.map((c, sortOrder) => ({ productId: product.id, colourId: colourIds.get(c.name)!, sortOrder })),
      }),
      prisma.productImage.deleteMany({ where: { productId: product.id } }),
      prisma.productImage.createMany({
        data: p.images.map((img, sortOrder) => ({
          productId: product.id,
          // Sample photography shows the lead colourway.
          colourId: sortOrder === 0 ? colourIds.get(p.colours[0].name)! : null,
          url: img.src,
          alt: img.alt,
          position: img.position ?? null,
          sortOrder,
        })),
      }),
    ]);

    for (const [ci, colour] of p.colours.entries()) {
      for (const size of p.sizes) {
        const sku = `A7-${String(i + 1).padStart(3, "0")}-${colour.name.toUpperCase()}-${size}`;
        const variant = await prisma.variant.upsert({
          where: { sku },
          create: { sku, productId: product.id, colourId: colourIds.get(colour.name)!, sizeId: sizeIds.get(`${system}:${size}`)! },
          update: { active: true },
        });
        variantCount++;
        const quantity = sampleStock(sku, size, ci, p);
        const existing = await prisma.inventory.findUnique({ where: { variantId: variant.id } });
        if (!existing) {
          await prisma.inventory.create({ data: { variantId: variant.id, quantity } });
          stockRows++;
        } else if (resetStock) {
          await prisma.inventory.update({ where: { variantId: variant.id }, data: { quantity, updatedAt: new Date() } });
          stockRows++;
        }
      }
    }
  }
  console.log(`✓ Catalogue: ${categories.length} categories, ${Object.keys(colours).length} colours, ${products.length} products, ${variantCount} variants (${stockRows} stock levels written)`);
}

async function seedDiscounts() {
  // SAMPLE codes — review values and dates before launch.
  const discounts = [
    { code: "WELCOME10", description: "Sample: 10% off a first order over ₹2,999 (up to ₹1,500)", type: "percentage", value: 10, minSubtotal: 2999, maxDiscount: 1500, usageLimit: null },
    { code: "FESTIVE500", description: "Sample: ₹500 off orders over ₹7,500 during the festive season", type: "fixed", value: 500, minSubtotal: 7500, maxDiscount: null, usageLimit: 500, startsAt: new Date("2026-10-15T00:00:00+05:30"), endsAt: new Date("2026-11-15T23:59:59+05:30") },
    { code: "TAILOR15", description: "Sample: 15% off tailoring over ₹15,000 (expired)", type: "percentage", value: 15, minSubtotal: 15000, maxDiscount: 5000, usageLimit: 100, startsAt: new Date("2026-03-01T00:00:00+05:30"), endsAt: new Date("2026-04-30T23:59:59+05:30") },
  ];
  for (const d of discounts) {
    await prisma.discount.upsert({ where: { code: d.code }, create: d, update: d });
  }
  console.log(`✓ Discounts: ${discounts.map((d) => d.code).join(", ")}`);
}

async function seedSampleOrders() {
  if ((await prisma.order.count({ where: { number: { startsWith: "A7-SAMPLE-" } } })) > 0) {
    console.log("✓ Sample orders already present");
    return;
  }
  const variantFor = (sku: string) => prisma.variant.findUniqueOrThrow({ where: { sku }, include: { product: true, colour: true, size: true } });
  const customers = [
    { name: "Arjun Mehta", email: "arjun.mehta@example.com", phone: "+919876543210", address1: "12 Marine Drive, Flat 4B", address2: "Near Churchgate", city: "Mumbai", state: "Maharashtra", pincode: "400020" },
    { name: "Kabir Rao", email: "kabir.rao@example.com", phone: "+919845012345", address1: "44 Residency Road, Apt 9", address2: null, city: "Bengaluru", state: "Karnataka", pincode: "560025" },
    { name: "Vikram Singh", email: "vikram.singh@example.com", phone: "+919811122233", address1: "B-17 Vasant Vihar", address2: "Second floor", city: "New Delhi", state: "Delhi", pincode: "110057" },
  ];
  const ids: string[] = [];
  for (const c of customers) {
    const customer = await prisma.customer.create({ data: { id: randomUUID(), email: c.email, name: c.name, phone: c.phone } });
    await prisma.address.create({
      data: { id: randomUUID(), customerId: customer.id, name: c.name, phone: c.phone, address1: c.address1, address2: c.address2, city: c.city, state: c.state, pincode: c.pincode, isDefault: true },
    });
    ids.push(customer.id);
  }

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const orders = [
    { n: 1, who: 0, status: "delivered", method: "razorpay", skus: [["A7-001-WHITE-M", 2], ["A7-006-CHARCOAL-32", 1]], placed: 9, shipped: 7, delivered: 5, discount: "WELCOME10" },
    { n: 2, who: 1, status: "shipped", method: "cod", skus: [["A7-009-NAVY-40", 1]], placed: 3, shipped: 1 },
    { n: 3, who: 2, status: "cod_confirmed", method: "cod", skus: [["A7-014-NAVY-L", 1], ["A7-002-ECRU-L", 1]], placed: 0 },
    { n: 4, who: 0, status: "paid", method: "razorpay", skus: [["A7-017-OLIVE-M", 1]], placed: 1 },
  ] as const;

  for (const o of orders) {
    const c = customers[o.who];
    const lines = await Promise.all(o.skus.map(async ([sku, quantity]) => ({ v: await variantFor(sku), quantity })));
    const subtotal = lines.reduce((s, l) => s + (l.v.priceOverride ?? l.v.product.price) * l.quantity, 0);
    const discountAmount = "discount" in o ? Math.min(Math.round(subtotal * 0.1), 1500) : 0;
    const shipping = subtotal - discountAmount >= 2999 ? 0 : 149;
    const total = subtotal - discountAmount + shipping;
    const id = randomUUID();
    const online = o.method === "razorpay";
    await prisma.order.create({
      data: {
        id,
        number: `A7-SAMPLE-${String(o.n).padStart(3, "0")}`,
        status: o.status,
        paymentMethod: o.method,
        email: c.email,
        phone: c.phone,
        name: c.name,
        address1: c.address1,
        address2: c.address2,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        subtotal,
        shipping,
        discountCode: "discount" in o ? o.discount : null,
        discountAmount,
        total,
        razorpayOrderId: online ? `order_sample${o.n}` : null,
        razorpayPaymentId: online ? `pay_sample${o.n}` : null,
        trackingNumber: "shipped" in o ? `DLV${100200300 + o.n}IN` : null,
        carrier: "shipped" in o ? "Delhivery" : null,
        shippedAt: "shipped" in o ? daysAgo(o.shipped) : null,
        deliveredAt: "delivered" in o ? daysAgo(o.delivered) : null,
        customerId: ids[o.who],
        createdAt: daysAgo(o.placed),
        items: {
          create: lines.map((l) => ({
            variantId: l.v.id,
            productSlug: l.v.product.slug,
            productName: l.v.product.name,
            colour: l.v.colour.name,
            size: l.v.size.label,
            unitPrice: l.v.priceOverride ?? l.v.product.price,
            quantity: l.quantity,
          })),
        },
        payments: {
          create: {
            id: randomUUID(),
            provider: o.method,
            // Online: captured at checkout. COD: collected on delivery.
            status: online || (o.status as string) === "delivered" ? "captured" : "pending",
            amount: total,
            providerOrderId: online ? `order_sample${o.n}` : null,
            providerPaymentId: online ? `pay_sample${o.n}` : null,
          },
        },
      },
    });
  }
  console.log(`✓ Sample data: ${customers.length} customers (@example.com), ${orders.length} orders (A7-SAMPLE-…)`);
}

// No top-level await: tsx runs this file as CommonJS.
async function main() {
  try {
    await seedCatalogue();
    await seedDiscounts();
    if (local || process.env.SEED_SAMPLE_ORDERS === "1") await seedSampleOrders();
  } catch (err) {
    console.error("✗ Seed failed:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
