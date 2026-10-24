/**
 * Database and data-access tests. Run with `npm test`, which starts a fresh,
 * isolated in-memory database (scripts/with-db.mjs --isolated), applies the
 * migrations and seeds the sample catalogue. These tests write data, so they
 * refuse to run against anything that isn't a local database.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { Prisma } from "@prisma/client";
import { checkAdminCredentials } from "@/lib/admin-auth";
import { deleteAddress, listAddresses, listCustomerOrders, saveAddress, setDefaultAddress } from "@/lib/server/customers";
import { db } from "@/lib/server/db";
import { OutOfStockError } from "@/lib/server/inventory";
import { createOrder, getOrder, markOrderPaid, type OrderItemInput } from "@/lib/server/orders";
import { prisma } from "@/lib/server/prisma";
import {
  getCheckoutVariants,
  getPublicProduct,
  getVariantAvailability,
  listProducts,
  loadCatalog,
  searchProducts,
} from "@/lib/server/products";
import { verifyPaymentSignature } from "@/lib/server/razorpay";

const url = new URL(process.env.DATABASE_URL ?? "postgres://missing");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || process.env.ACT_VII_SAMPLE_DB !== "1") {
  throw new Error(`Refusing to run database tests against ${url.hostname}. Use \`npm test\` (isolated in-memory database).`);
}

const customer = { email: "test@example.com", phone: "+919876543210", name: "Test Customer", address1: "1 Test Lane", address2: "", city: "Pune", state: "Maharashtra", pincode: "411001", giftNote: "" };
const totals = (subtotal: number) => ({ subtotal, shipping: 0, codFee: 0, total: subtotal });

/** A real variant from the seeded catalogue, as checkout would price it. */
async function item(slug: string, colour: string, size: string, quantity = 1): Promise<OrderItemInput> {
  const v = (await getCheckoutVariants([slug])).get(`${slug}|${colour}|${size}`);
  assert.ok(v, `variant ${slug}/${colour}/${size} should exist`);
  return { variantId: v.variantId, sku: v.sku, slug: v.slug, name: v.name, colour: v.colour, size: v.size, unitPrice: v.price, quantity };
}

async function setStock(sku: string, quantity: number) {
  await prisma().inventory.updateMany({ where: { variant: { sku } }, data: { quantity } });
}

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

after(async () => {
  await prisma().$disconnect();
  await db().end();
});

describe("database connection", () => {
  test("connects and the migrations are applied", async () => {
    const [{ ok }] = await prisma().$queryRaw<{ ok: number }[]>`select 1 as ok`;
    assert.equal(ok, 1);
    const migrations = await prisma().$queryRaw<{ migration_name: string }[]>`select migration_name from _prisma_migrations where finished_at is not null`;
    assert.ok(migrations.length >= 2);
  });
});

describe("products, categories and variants", () => {
  test("seeded catalogue is retrievable with its relations", async () => {
    const { categories, products } = await loadCatalog();
    assert.equal(categories.length, 5);
    assert.equal(products.length, 19);
    const oxford = await getPublicProduct("classic-oxford-shirt");
    assert.ok(oxford);
    assert.equal(oxford.category, "shirts");
    assert.deepEqual(oxford.sizes, ["XS", "S", "M", "L", "XL", "XXL"]);
    assert.equal(oxford.variants.length, oxford.colours.length * oxford.sizes.length);
    assert.ok(oxford.variants.every((v) => /^A7-001-[A-Z]+-\w+$/.test(v.sku)));
  });

  test("a new product can be created and read back", async () => {
    const shirts = await prisma().category.findUniqueOrThrow({ where: { slug: "shirts" } });
    const navy = await prisma().colour.findUniqueOrThrow({ where: { name: "Navy" } });
    const m = await prisma().size.findUniqueOrThrow({ where: { system_label: { system: "tops", label: "M" } } });
    await prisma().product.create({
      data: {
        slug: "test-created-tee",
        name: "Test Tee",
        categoryId: shirts.id,
        price: 1999,
        summary: "s",
        description: "d",
        fabric: "f",
        fit: "x",
        addedOn: new Date("2026-01-01"),
        colours: { create: { colourId: navy.id } },
        variants: { create: { sku: "TEST-TEE-NAVY-M", colourId: navy.id, sizeId: m.id, inventory: { create: { quantity: 4 } } } },
      },
    });
    const tee = await getPublicProduct("test-created-tee");
    assert.ok(tee);
    assert.equal(tee.price, 1999);
    assert.deepEqual(tee.variants.map((v) => [v.sku, v.colour, v.size, v.stock]), [["TEST-TEE-NAVY-M", "Navy", "M", 4]]);
  });

  test("slugs and SKUs are unique", async () => {
    const shirts = await prisma().category.findUniqueOrThrow({ where: { slug: "shirts" } });
    await assert.rejects(
      prisma().product.create({
        data: { slug: "classic-oxford-shirt", name: "Dup", categoryId: shirts.id, price: 1, summary: "", description: "", fabric: "", fit: "", addedOn: new Date() },
      }),
      isUniqueViolation,
    );
    const existing = await prisma().variant.findFirstOrThrow({ where: { sku: "A7-001-NAVY-M" } });
    await assert.rejects(
      prisma().variant.create({ data: { sku: "A7-001-NAVY-M", productId: existing.productId, colourId: existing.colourId, sizeId: existing.sizeId } }),
      isUniqueViolation,
    );
  });

  test("stock can never go negative (database constraint)", async () => {
    await assert.rejects(prisma().inventory.updateMany({ where: { variant: { sku: "A7-001-NAVY-L" } }, data: { quantity: -1 } }));
  });
});

describe("filtering, sorting and pagination", () => {
  test("filters by category, colour, size and price", async () => {
    const shirts = await listProducts({ category: "shirts", pageSize: 100 });
    assert.ok(shirts.total >= 5 && shirts.items.every((p) => p.category === "shirts"));

    const navy = await listProducts({ colours: ["Navy"], pageSize: 100 });
    assert.ok(navy.total > 0 && navy.items.every((p) => p.colours.some((c) => c.name === "Navy")));

    const size28 = await listProducts({ sizes: ["28"], pageSize: 100 });
    assert.ok(size28.total > 0 && size28.items.every((p) => p.variants.some((v) => v.size === "28" && v.stock > 0)));

    const cheap = await listProducts({ priceRanges: [{ min: 0, max: 2999 }], pageSize: 100 });
    assert.ok(cheap.total > 0 && cheap.items.every((p) => p.price <= 2999));
  });

  test("availability filter hides sold-out products", async () => {
    const all = await listProducts({ pageSize: 100 });
    const inStock = await listProducts({ inStock: true, pageSize: 100 });
    assert.ok(all.items.some((p) => p.slug === "indigo-trucker-jacket")); // seeded with no stock
    assert.ok(!inStock.items.some((p) => p.slug === "indigo-trucker-jacket"));
  });

  test("sorts by price and newest", async () => {
    const asc = (await listProducts({ sort: "price-asc", pageSize: 100 })).items.map((p) => p.price);
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    const desc = (await listProducts({ sort: "price-desc", pageSize: 100 })).items.map((p) => p.price);
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
    const newest = (await listProducts({ sort: "newest", pageSize: 100 })).items.map((p) => p.addedOn);
    assert.deepEqual(newest, [...newest].sort().reverse());
  });

  test("pagination is stable: pages cover every product exactly once", async () => {
    const total = (await listProducts({ pageSize: 100 })).total;
    const seen: string[] = [];
    for (let page = 1; page <= Math.ceil(total / 4); page++) {
      seen.push(...(await listProducts({ sort: "price-asc", page, pageSize: 4 })).items.map((p) => p.slug));
    }
    assert.equal(seen.length, total);
    assert.equal(new Set(seen).size, total);
  });

  test("search matches names, categories and colours", async () => {
    assert.ok((await searchProducts("oxford")).some((p) => p.slug === "classic-oxford-shirt"));
    assert.ok((await searchProducts("blazers")).every((p) => /blazer/i.test(p.name) || p.category === "suits-blazers"));
    assert.equal((await searchProducts("zzz-no-such-thing")).length, 0);
  });
});

describe("public visibility", () => {
  test("draft and archived products never appear in public queries", async () => {
    await prisma().product.update({ where: { slug: "test-created-tee" }, data: { status: "draft" } });
    await prisma().product.update({ where: { slug: "rust-suede-bomber" }, data: { status: "archived" } });
    try {
      for (const slug of ["test-created-tee", "rust-suede-bomber"]) {
        assert.equal(await getPublicProduct(slug), null, `${slug} should be hidden`);
        assert.equal(await getVariantAvailability(slug), null);
        assert.ok(!(await listProducts({ pageSize: 100 })).items.some((p) => p.slug === slug));
        assert.ok(!(await loadCatalog()).products.some((p) => p.slug === slug));
        assert.ok(!(await searchProducts(slug.split("-")[0])).some((p) => p.slug === slug));
        assert.equal((await getCheckoutVariants([slug])).size, 0, "hidden products can't be bought");
      }
    } finally {
      await prisma().product.update({ where: { slug: "rust-suede-bomber" }, data: { status: "active" } });
    }
  });

  test("missing products are handled gracefully", async () => {
    assert.equal(await getPublicProduct("does-not-exist"), null);
    assert.equal(await getVariantAvailability("does-not-exist"), null);
    assert.equal((await getCheckoutVariants(["does-not-exist"])).size, 0);
  });
});

describe("stock and orders", () => {
  test("an order larger than the stock is rejected and takes nothing", async () => {
    await setStock("A7-001-NAVY-XL", 2);
    await assert.rejects(
      createOrder({ customer, items: [await item("classic-oxford-shirt", "Navy", "XL", 3)], method: "cod", totals: totals(7497) }),
      (err) => err instanceof OutOfStockError && err.available === 2,
    );
    const { quantity } = await prisma().inventory.findFirstOrThrow({ where: { variant: { sku: "A7-001-NAVY-XL" } } });
    assert.equal(quantity, 2);
    assert.equal(await prisma().order.count({ where: { email: customer.email, items: { some: { sku: "A7-001-NAVY-XL" } } } }), 0);
  });

  test("concurrent orders for the last unit: exactly one succeeds", async () => {
    await setStock("A7-001-NAVY-S", 1);
    const line = await item("classic-oxford-shirt", "Navy", "S", 1);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => createOrder({ customer, items: [line], method: "cod", totals: totals(line.unitPrice) })),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.ok(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof OutOfStockError));
    const { quantity } = await prisma().inventory.findFirstOrThrow({ where: { variant: { sku: "A7-001-NAVY-S" } } });
    assert.equal(quantity, 0);
  });

  test("order lines keep their name, SKU and price after the product changes", async () => {
    await setStock("A7-006-CHARCOAL-30", 5);
    const line = await item("wide-leg-trouser", "Charcoal", "30", 2);
    const { id } = await createOrder({ customer, items: [line], method: "cod", totals: totals(line.unitPrice * 2) });

    await prisma().product.update({ where: { slug: "wide-leg-trouser" }, data: { name: "Renamed Trouser", price: 9999 } });
    await prisma().variant.update({ where: { sku: "A7-006-CHARCOAL-30" }, data: { sku: "A7-006-CHARCOAL-30-NEW" } });
    try {
      const order = await getOrder(id);
      assert.ok(order);
      const [snapshot] = await prisma().orderItem.findMany({ where: { orderId: id } });
      assert.equal(order.items[0].productName, "Wide Leg Trouser");
      assert.equal(order.items[0].unitPrice, line.unitPrice);
      assert.equal(snapshot.sku, "A7-006-CHARCOAL-30");
      assert.equal(order.items[0].unitPrice * order.items[0].quantity, line.unitPrice * 2); // line total
    } finally {
      await prisma().variant.update({ where: { sku: "A7-006-CHARCOAL-30-NEW" }, data: { sku: "A7-006-CHARCOAL-30" } });
      await prisma().product.update({ where: { slug: "wide-leg-trouser" }, data: { name: "Wide Leg Trouser", price: line.unitPrice } });
    }
  });

  test("order status comes from the server, never from the request", async () => {
    await setStock("A7-001-NAVY-M", 10);
    const cod = await createOrder({ customer, items: [await item("classic-oxford-shirt", "Navy", "M")], method: "cod", totals: totals(2499) });
    const online = await createOrder({ customer, items: [await item("classic-oxford-shirt", "Navy", "M")], method: "razorpay", totals: totals(2499) });
    assert.equal(cod.status, "cod_confirmed");
    assert.equal(online.status, "pending_payment", "an online order starts unpaid");
    const payment = await prisma().payment.findFirstOrThrow({ where: { orderId: online.id } });
    assert.equal(payment.status, "created");
    // Marking paid needs the matching gateway order id (only known after a verified payment).
    assert.equal(await markOrderPaid({ orderId: online.id, razorpayOrderId: "order_forged" }, "pay_forged"), null);
    assert.equal((await getOrder(online.id))?.status, "pending_payment");
  });
});

describe("customer data isolation", () => {
  const a = randomUUID();
  const b = randomUUID();
  const address = { name: "A", phone: "+919800000001", address1: "1 A Street", address2: "", city: "Pune", state: "Maharashtra", pincode: "411001" };

  before(async () => {
    await prisma().customer.createMany({ data: [{ id: a, email: "a@example.com" }, { id: b, email: "b@example.com" }] });
  });

  test("one customer can't see, change or delete another's addresses", async () => {
    await saveAddress(a, address);
    const [own] = await listAddresses(a);
    assert.ok(own);
    assert.deepEqual(await listAddresses(b), []);

    await deleteAddress(b, own.id); // B tries to delete A's address
    await saveAddress(b, { ...address, name: "Hijacked" }, { id: own.id }); // B tries to edit it
    await setDefaultAddress(b, own.id);
    const [after] = await listAddresses(a);
    assert.equal(after?.id, own.id);
    assert.equal(after?.name, "A");
    assert.deepEqual(await listAddresses(b), []);
  });

  test("order history only shows the customer's own orders", async () => {
    await setStock("A7-001-NAVY-L", 5);
    const line = await item("classic-oxford-shirt", "Navy", "L");
    const own = await createOrder({ customer: { ...customer, email: "a@example.com" }, items: [line], method: "cod", totals: totals(2499), customerId: a });
    assert.ok((await listCustomerOrders({ id: a, email: "a@example.com" })).some((o) => o.id === own.id));
    assert.ok(!(await listCustomerOrders({ id: b, email: "b@example.com" })).some((o) => o.id === own.id));
  });
});

describe("unauthorised writes are rejected", () => {
  test("admin access requires the configured credentials", () => {
    const saved = { user: process.env.ADMIN_USER, pass: process.env.ADMIN_PASSWORD };
    process.env.ADMIN_USER = "admin";
    process.env.ADMIN_PASSWORD = "correct-horse-battery";
    try {
      assert.equal(checkAdminCredentials(undefined, undefined), false);
      assert.equal(checkAdminCredentials("admin", "wrong-password"), false);
      assert.equal(checkAdminCredentials("someone", "correct-horse-battery"), false);
      assert.equal(checkAdminCredentials("admin", ["correct-horse-battery"]), false, "non-string input is rejected");
      assert.equal(checkAdminCredentials("admin", "correct-horse-battery"), true);
      process.env.ADMIN_PASSWORD = "short";
      assert.equal(checkAdminCredentials("admin", "short"), false, "admin stays disabled with a weak password");
    } finally {
      process.env.ADMIN_USER = saved.user;
      process.env.ADMIN_PASSWORD = saved.pass;
    }
  });

  test("forged payment signatures are rejected", () => {
    const saved = process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_KEY_SECRET = "test-secret";
    try {
      assert.equal(verifyPaymentSignature("order_1", "pay_1", "0".repeat(64)), false);
      assert.equal(verifyPaymentSignature("order_1", "pay_1", ""), false);
    } finally {
      process.env.RAZORPAY_KEY_SECRET = saved;
    }
  });
});

describe("development seed", () => {
  test("re-running the seed adds nothing and keeps edited data", async () => {
    const count = async () => ({
      products: await prisma().product.count(),
      variants: await prisma().variant.count(),
      inventory: await prisma().inventory.count(),
      discounts: await prisma().discount.count(),
      orders: await prisma().order.count({ where: { number: { startsWith: "A7-SAMPLE-" } } }),
    });
    await prisma().product.update({ where: { slug: "merino-crew-neck" }, data: { price: 4321 } });
    await setStock("A7-014-NAVY-M", 77);
    const before = await count();

    const run = spawnSync("npx", ["tsx", "prisma/seed.ts"], { env: process.env, encoding: "utf8", shell: process.platform === "win32" });
    assert.equal(run.status, 0, run.stderr || run.stdout);

    assert.deepEqual(await count(), before);
    assert.equal((await prisma().product.findUniqueOrThrow({ where: { slug: "merino-crew-neck" } })).price, 4321, "edited price is kept");
    const { quantity } = await prisma().inventory.findFirstOrThrow({ where: { variant: { sku: "A7-014-NAVY-M" } } });
    assert.equal(quantity, 77, "edited stock is kept");
  });
});
