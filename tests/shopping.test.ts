/**
 * Phase 3 shopping tests: shipping rules, cart checks, account carts,
 * idempotent order creation and order numbers. Run with `npm test`
 * (isolated in-memory database). Uses the Relaxed Linen Shirt (A7-002-…)
 * and Fine Print Cotton Shirt (A7-003-…) so it can run alongside
 * database.test.ts without touching the same stock.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { placeTestOrder } from "@/app/checkout/actions";
import { priceLabel, type Product } from "@/lib/catalog";
import { applyFilters, parseFilters, priceBands } from "@/lib/filters";
import { formatINR } from "@/lib/format";
import { codAvailable, computeTotals } from "@/lib/pricing";
import { policy } from "@/lib/site";
import { checkCart, checkLines, cleanLines, clearCustomerCart, getCustomerCart, mergeCartLines, saveCustomerCart } from "@/lib/server/cart";
import { db } from "@/lib/server/db";
import {
  createOrder,
  DuplicateCheckoutError,
  findOrderByCheckoutToken,
  MAX_OPEN_COD_ORDERS,
  MAX_ORDERS_PER_IP_PER_HOUR,
  OrderLimitError,
  orderNumber,
  type OrderItemInput,
} from "@/lib/server/orders";
import { prisma } from "@/lib/server/prisma";
import { getCheckoutVariants } from "@/lib/server/products";

const url = new URL(process.env.DATABASE_URL ?? "postgres://missing");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || process.env.ACT_VII_SAMPLE_DB !== "1") {
  throw new Error(`Refusing to run database tests against ${url.hostname}. Use \`npm test\` (isolated in-memory database).`);
}

const LINEN = "relaxed-linen-shirt";
const PRINT = "fine-print-cotton-shirt";

after(async () => {
  await prisma().$disconnect();
  await db().end();
});

async function stock(slug: string, colour: string, size: string, quantity: number) {
  await prisma().inventory.updateMany({ where: { variant: { product: { slug }, colour: { name: colour }, size: { label: size } } }, data: { quantity } });
}

async function firstColour(slug: string) {
  return (await prisma().productColour.findFirstOrThrow({ where: { product: { slug } }, orderBy: { sortOrder: "asc" }, include: { colour: true } })).colour.name;
}

describe("shipping and totals", () => {
  test("free shipping from the threshold, flat rate below it, none for an empty bag", () => {
    assert.deepEqual(computeTotals(0), { subtotal: 0, discount: 0, shipping: 0, codFee: 0, total: 0 });
    const below = computeTotals(policy.freeShippingThreshold - 1);
    assert.equal(below.shipping, policy.standardShipping);
    assert.equal(below.total, policy.freeShippingThreshold - 1 + policy.standardShipping);
    assert.equal(computeTotals(policy.freeShippingThreshold).shipping, 0);
  });

  test("COD fee applies only to cash on delivery, within the COD limit", () => {
    assert.equal(computeTotals(5000, "cod").codFee, policy.codFee);
    assert.equal(computeTotals(5000, "razorpay").codFee, 0);
    assert.equal(codAvailable(policy.codMaxOrderValue), true);
    assert.equal(codAvailable(policy.codMaxOrderValue + 1), false);
    assert.equal(codAvailable(0), false);
  });
});

describe("per-variant prices in listings", () => {
  const variant = (size: string, price: number) => ({ sku: size, colour: "Navy", size, price, stock: 5, lowStockThreshold: 3 });
  const product = (slug: string, price: number, prices: number[]) =>
    ({ slug, price, variants: prices.map((p, i) => variant(String(i), p)) }) as unknown as Product;

  test("a product priced differently by colour/size shows \"From\" its lowest price", () => {
    assert.equal(priceLabel(product("a", 12_999, [12_999, 11_999])), `From ${formatINR(11_999)}`);
    assert.equal(priceLabel(product("b", 12_999, [12_999, 12_999])), formatINR(12_999));
    assert.equal(priceLabel(product("c", 4_999, [])), formatINR(4_999));
  });

  test("sorting and the price filter use the lowest price", () => {
    const cheapVariant = product("cheap-variant", 9_000, [9_000, 2_000]);
    const mid = product("mid", 3_000, [3_000]);
    assert.deepEqual(applyFilters([mid, cheapVariant], { ...parseFilters(new URLSearchParams()), sort: "price-asc" }, []).map((p) => p.slug), ["cheap-variant", "mid"]);
    const band = priceBands.find((b) => 2_000 >= b.min && 2_000 <= b.max)!;
    const f = { ...parseFilters(new URLSearchParams()), price: [band.value] };
    assert.ok(applyFilters([cheapVariant], f, []).some((p) => p.slug === "cheap-variant"));
  });
});

describe("cart checks", () => {
  test("cleanLines drops junk and merges duplicates", () => {
    const lines = cleanLines([
      { slug: LINEN, colour: "White", size: "M", quantity: 1 },
      { slug: LINEN, colour: "White", size: "M", quantity: 2 },
      { slug: "", colour: "White", size: "M", quantity: 1 },
      { slug: LINEN, colour: "White", size: "M", quantity: "lots" },
      null,
    ]);
    assert.deepEqual(lines, [{ slug: LINEN, colour: "White", size: "M", quantity: 3 }]);
  });

  test("each line gets a status from live stock; totals only count good lines", async () => {
    const colour = await firstColour(LINEN);
    await stock(LINEN, colour, "S", 5);
    await stock(LINEN, colour, "M", 1);
    await stock(LINEN, colour, "L", 0);
    const check = await checkCart([
      { slug: LINEN, colour, size: "S", quantity: 2 },
      { slug: LINEN, colour, size: "M", quantity: 3 },
      { slug: LINEN, colour, size: "L", quantity: 1 },
      { slug: LINEN, colour: "Neon", size: "S", quantity: 1 },
      { slug: "no-such-product", colour, size: "S", quantity: 1 },
      { slug: LINEN, colour, size: "XL", quantity: 99 },
    ]);
    const status = Object.fromEntries(check.lines.map((l) => [`${l.colour}/${l.size}${l.slug === LINEN ? "" : ":" + l.slug}`, [l.status, l.available]]));
    assert.deepEqual(status[`${colour}/S`], ["ok", 5]);
    assert.deepEqual(status[`${colour}/M`], ["low", 1]);
    assert.deepEqual(status[`${colour}/L`], ["sold-out", 0]);
    assert.deepEqual(status["Neon/S"], ["unavailable", 0]);
    assert.equal(status[`${colour}/S:no-such-product`][0], "unavailable");
    assert.equal(status[`${colour}/XL`][0], "invalid-quantity");
    assert.equal(check.blocking, true);
    const price = (await getCheckoutVariants([LINEN])).get(`${LINEN}|${colour}|S`)!.price;
    assert.equal(check.totals.subtotal, price * 2, "only the good line is priced");
  });

  test("prices come from the database, not the request", async () => {
    const colour = await firstColour(LINEN);
    await stock(LINEN, colour, "S", 5);
    const tampered = await checkCart([{ slug: LINEN, colour, size: "S", quantity: 1, unitPrice: 1 } as never]);
    const price = (await getCheckoutVariants([LINEN])).get(`${LINEN}|${colour}|S`)!.price;
    assert.equal(tampered.lines[0].unitPrice, price);
    assert.equal(tampered.totals.subtotal, price);
  });

  test("checkLines is pure and reports a clean bag as non-blocking", () => {
    const variants = new Map([["a|Navy|M", { variantId: 1, sku: "X", slug: "a", name: "A", colour: "Navy", size: "M", price: 1000, stock: 4 }]]);
    const check = checkLines([{ slug: "a", colour: "Navy", size: "M", quantity: 2 }], variants, "razorpay");
    assert.equal(check.blocking, false);
    assert.deepEqual(check.totals, computeTotals(2000, "razorpay"));
  });
});

describe("account carts", () => {
  const a = randomUUID();
  const b = randomUUID();

  test("a saved bag round-trips, keeping only real variants", async () => {
    await prisma().customer.createMany({ data: [{ id: a, email: "cart-a@example.com" }, { id: b, email: "cart-b@example.com" }] });
    const colour = await firstColour(PRINT);
    const saved = await saveCustomerCart(a, [
      { slug: PRINT, colour, size: "M", quantity: 2 },
      { slug: PRINT, colour, size: "M", quantity: 1 }, // duplicate merges to 3
      { slug: PRINT, colour: "Neon", size: "M", quantity: 1 }, // not a real variant
      { slug: PRINT, colour, size: "L", quantity: 50 }, // clamped to the per-line limit
    ]);
    assert.equal(saved, 2);
    const cart = await getCustomerCart(a);
    assert.deepEqual(
      cart.map((l) => [l.size, l.quantity]).sort(),
      [["L", policy.maxQuantityPerLine], ["M", 3]],
    );
  });

  test("customers never see each other's bags", async () => {
    assert.deepEqual(await getCustomerCart(b), []);
    await saveCustomerCart(b, []);
    assert.equal((await getCustomerCart(a)).length, 2, "B saving an empty bag leaves A's alone");
  });

  test("merging keeps the larger quantity instead of adding, so syncing twice never doubles", () => {
    const saved = [{ slug: "x", colour: "Navy", size: "M", quantity: 2 }];
    const device = [
      { slug: "x", colour: "Navy", size: "M", quantity: 1 },
      { slug: "y", colour: "Ecru", size: "L", quantity: 1 },
    ];
    const once = mergeCartLines(saved, device);
    assert.deepEqual(once, [
      { slug: "x", colour: "Navy", size: "M", quantity: 2 },
      { slug: "y", colour: "Ecru", size: "L", quantity: 1 },
    ]);
    assert.deepEqual(mergeCartLines(once, once), once);
  });

  test("with a sync base, items ordered or removed on another device don't come back", () => {
    const shirt = { slug: "x", colour: "Navy", size: "M", quantity: 1 };
    const scarf = { slug: "y", colour: "Ecru", size: "L", quantity: 1 };
    // This device last synced [shirt]; meanwhile the shirt was ordered elsewhere (saved bag is empty).
    assert.deepEqual(mergeCartLines([], [shirt], [shirt]), []);
    // A line added on this device since the last sync is kept.
    assert.deepEqual(mergeCartLines([], [shirt, scarf], [shirt]), [scarf]);
    // A quantity changed on this device wins over the saved one.
    assert.deepEqual(mergeCartLines([{ ...shirt, quantity: 3 }], [{ ...shirt, quantity: 2 }], [shirt]), [{ ...shirt, quantity: 2 }]);
    // A line removed on this device stays removed even though it's still saved.
    assert.deepEqual(mergeCartLines([shirt, scarf], [scarf], [shirt, scarf]), [scarf]);
    // Untouched lines follow the saved bag (e.g. quantity changed on another device).
    assert.deepEqual(mergeCartLines([{ ...shirt, quantity: 4 }], [shirt], [shirt]), [{ ...shirt, quantity: 4 }]);
  });

  test("clearing a bag after an order empties only that customer's bag", async () => {
    await clearCustomerCart(a);
    assert.deepEqual(await getCustomerCart(a), []);
  });
});

describe("order creation", () => {
  const customer = { email: "shop@example.com", phone: "+919876543210", name: "Shop Test", address1: "1 Test Lane", address2: "", city: "Pune", state: "Maharashtra", pincode: "411001", giftNote: "" };
  /** A fresh shopper per order, so the open cash-on-delivery limit never interferes with what a test checks. */
  let shoppers = 0;
  const shopper = () => {
    const n = String(++shoppers).padStart(5, "0");
    return { ...customer, phone: `+9192000${n}`, email: `shopper-${n}@shop.example.com` };
  };

  async function line(size: string, quantity = 1): Promise<OrderItemInput> {
    const colour = await firstColour(PRINT);
    const v = (await getCheckoutVariants([PRINT])).get(`${PRINT}|${colour}|${size}`)!;
    return { variantId: v.variantId, sku: v.sku, slug: v.slug, name: v.name, colour: v.colour, size: v.size, unitPrice: v.price, quantity };
  }

  test("the same checkout token creates one order and takes stock once", async () => {
    const colour = await firstColour(PRINT);
    await stock(PRINT, colour, "S", 5);
    const item = await line("S", 2);
    const token = `test-${randomUUID().replace(/-/g, "")}`;
    const totals = computeTotals(item.unitPrice * 2, "cod");

    const results = await Promise.allSettled([1, 2, 3].map(() => createOrder({ customer: shopper(), items: [item], method: "cod", totals, checkoutToken: token })));
    const created = results.filter((r) => r.status === "fulfilled");
    assert.equal(created.length, 1, "exactly one order");
    assert.ok(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof DuplicateCheckoutError));

    const existing = await findOrderByCheckoutToken(token);
    assert.equal(existing?.id, (created[0] as PromiseFulfilledResult<{ id: string }>).value.id);
    assert.equal(await prisma().order.count({ where: { checkoutToken: token } }), 1);
    const { quantity } = await prisma().inventory.findFirstOrThrow({ where: { variant: { sku: item.sku } } });
    assert.equal(quantity, 3, "stock taken once, not three times");
  });

  test("orders record subtotal, shipping, total and a payment row", async () => {
    const colour = await firstColour(PRINT);
    await stock(PRINT, colour, "XS", 5);
    const item = await line("XS", 1);
    const totals = computeTotals(item.unitPrice, "cod");
    const { id } = await createOrder({ customer: shopper(), items: [item], method: "cod", totals });
    const order = await prisma().order.findUniqueOrThrow({ where: { id }, include: { payments: true, items: true } });
    assert.deepEqual([order.subtotal, order.shipping, order.codFee, order.total], [totals.subtotal, totals.shipping, totals.codFee, totals.total]);
    assert.equal(order.items[0].sku, item.sku);
    assert.deepEqual(order.payments.map((p) => [p.provider, p.status, p.amount]), [["cod", "pending", totals.total]]);
  });

  test("one phone number or email can have at most two open cash-on-delivery orders, even in a burst", async () => {
    const colour = await firstColour(PRINT);
    await stock(PRINT, colour, "XXL", 20);
    const item = await line("XXL", 1);
    const totals = computeTotals(item.unitPrice, "cod");
    const buyer = shopper();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => createOrder({ customer: buyer, items: [item], method: "cod", totals })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, MAX_OPEN_COD_ORDERS);
    assert.ok(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof OrderLimitError));
    const { quantity } = await prisma().inventory.findFirstOrThrow({ where: { variant: { sku: item.sku } } });
    assert.equal(quantity, 20 - MAX_OPEN_COD_ORDERS, "refused orders hold no stock");

    // The same email with another phone is also held back; paying online still works.
    await assert.rejects(createOrder({ customer: { ...buyer, phone: "+919199999999" }, items: [item], method: "cod", totals }), OrderLimitError);
    assert.ok(await createOrder({ customer: buyer, items: [item], method: "razorpay", totals: computeTotals(item.unitPrice, "razorpay") }));

    // Once one ships, there's room for another.
    const open = await prisma().order.findFirstOrThrow({ where: { email: buyer.email, status: "cod_confirmed" } });
    await prisma().order.update({ where: { id: open.id }, data: { status: "shipped" } });
    assert.ok(await createOrder({ customer: buyer, items: [item], method: "cod", totals }));
  });

  test("one address can place at most the allowed number of orders an hour", async () => {
    const colour = await firstColour(PRINT);
    await stock(PRINT, colour, "L", 50);
    const item = await line("L", 1);
    const totals = computeTotals(item.unitPrice, "razorpay");
    const ip = "198.51.100.77";
    const results = await Promise.allSettled(
      Array.from({ length: MAX_ORDERS_PER_IP_PER_HOUR + 3 }, () => createOrder({ customer: shopper(), items: [item], method: "razorpay", totals, clientIp: ip })),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, MAX_ORDERS_PER_IP_PER_HOUR);
    assert.ok(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof OrderLimitError));
    assert.ok(await createOrder({ customer: shopper(), items: [item], method: "razorpay", totals, clientIp: "198.51.100.78" }), "other addresses are unaffected");
  });

  test("checkout merges repeated lines, so splitting a quantity can't get past the per-item limit", async () => {
    const colour = await firstColour(PRINT);
    await stock(PRINT, colour, "M", 50);
    const fields = { email: "split@example.com", phone: "9876500000", name: "Split Test", address1: "1 Test Lane", address2: "", city: "Pune", state: "Maharashtra", pincode: "411001" };
    const half = Math.ceil(policy.maxQuantityPerLine / 2) + 1;
    const line = { slug: PRINT, colour, size: "M", quantity: half };
    const tooMany = await placeTestOrder({ fields, giftNote: "", lines: [line, line] });
    assert.equal(tooMany.ok, false);

    const fine = await placeTestOrder({ fields, giftNote: "", lines: [{ ...line, quantity: 4 }, { ...line, quantity: 5 }] });
    assert.ok(fine.ok);
    assert.deepEqual(fine.receipt.items.map((i) => i.quantity), [9], "one merged line");
  });

  test("order numbers use the date in India", () => {
    // 19:10 UTC on 23 Oct is 00:40 on 24 Oct in India.
    assert.match(orderNumber(new Date("2026-10-23T19:10:00Z")), /^A7-261024-[A-HJ-NP-Z2-9]{4}$/);
    assert.match(orderNumber(new Date("2026-10-23T12:00:00Z")), /^A7-261023-/);
  });
});
