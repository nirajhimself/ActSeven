/**
 * Coupon codes: the discount maths, every rule, and redemption limits under
 * parallel orders. Run with `npm test` (isolated in-memory database). Uses
 * the Tapered Cotton Chino so it doesn't touch other test files' stock.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { computeTotals, discountFor } from "@/lib/pricing";
import { policy } from "@/lib/site";
import { checkCart } from "@/lib/server/cart";
import { db } from "@/lib/server/db";
import { DiscountError, normaliseCode, previewDiscount } from "@/lib/server/discounts";
import { cancelOrder, createOrder, getOrder, type OrderItemInput } from "@/lib/server/orders";
import { prisma } from "@/lib/server/prisma";
import { getCheckoutVariants } from "@/lib/server/products";
import { createReturn } from "@/lib/server/returns";
import { RETURN_REASONS } from "@/lib/returns";

const url = new URL(process.env.DATABASE_URL ?? "postgres://missing");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || process.env.ACT_VII_SAMPLE_DB !== "1") {
  throw new Error(`Refusing to run database tests against ${url.hostname}. Use \`npm test\` (isolated in-memory database).`);
}

const CHINO = "tapered-cotton-chino";
let item: OrderItemInput;
let shoppers = 0;
const shopper = () => {
  const n = String(++shoppers).padStart(5, "0");
  return { email: `coupon-${n}@example.com`, phone: `+9193000${n}`, name: "Coupon Test", address1: "1 Test Lane", address2: "", city: "Pune", state: "Maharashtra", pincode: "411001", giftNote: "" };
};

const day = 24 * 60 * 60 * 1000;
async function coupon(code: string, rule: Partial<{ type: string; value: number; minSubtotal: number; maxDiscount: number | null; usageLimit: number | null; oncePerCustomer: boolean; active: boolean; startsAt: Date | null; endsAt: Date | null }> = {}) {
  await prisma().discount.create({ data: { code, description: `Test ${code}`, type: "percentage", value: 10, ...rule } });
}

/** Places an order for one chino with the given code, priced as checkout would. */
async function orderWith(code: string, customer = shopper()) {
  const preview = await previewDiscount(code, item.unitPrice, customer);
  const amount = preview.ok ? preview.discount.amount : 0;
  return createOrder({ customer, items: [item], method: "razorpay", totals: computeTotals(item.unitPrice, "razorpay", amount), discountCode: code });
}

before(async () => {
  const v = [...(await getCheckoutVariants([CHINO])).values()][0];
  await prisma().inventory.update({ where: { variantId: v.variantId }, data: { quantity: 100 } });
  item = { variantId: v.variantId, sku: v.sku, slug: v.slug, name: v.name, colour: v.colour, size: v.size, unitPrice: v.price, quantity: 1 };
});
after(async () => {
  await prisma().$disconnect();
  await db().end();
});

describe("discount maths", () => {
  test("percentage codes round down and respect their cap; fixed codes never exceed the subtotal", () => {
    assert.equal(discountFor({ type: "percentage", value: 10, maxDiscount: null }, 2499), 249);
    assert.equal(discountFor({ type: "percentage", value: 50, maxDiscount: 500 }, 4000), 500);
    assert.equal(discountFor({ type: "fixed", value: 500, maxDiscount: null }, 2000), 500);
    assert.equal(discountFor({ type: "fixed", value: 5000, maxDiscount: null }, 2000), 2000);
  });

  test("the discount comes off products only, and free shipping is judged after it", () => {
    const t = computeTotals(policy.freeShippingThreshold + 100, "cod", 200);
    assert.equal(t.discount, 200);
    assert.equal(t.shipping, policy.standardShipping, "below the threshold once discounted");
    assert.equal(t.total, policy.freeShippingThreshold + 100 - 200 + policy.standardShipping + policy.codFee);
    const free = computeTotals(1000, undefined, 5000);
    assert.equal(free.discount, 1000, "never more than the products cost");
    assert.equal(free.total, policy.standardShipping);
  });

  test("codes are matched case-insensitively and junk is rejected", () => {
    assert.equal(normaliseCode("  welcome10 "), "WELCOME10");
    assert.equal(normaliseCode("bad code!"), null);
    assert.equal(normaliseCode(""), null);
  });
});

describe("coupon rules", () => {
  test("unknown, switched-off, not-yet-started and expired codes are refused with a reason", async () => {
    await coupon("RULE-OFF", { active: false });
    await coupon("RULE-SOON", { startsAt: new Date(Date.now() + day) });
    await coupon("RULE-OVER", { endsAt: new Date(Date.now() - day) });
    assert.deepEqual(await previewDiscount("NOPE-123", 5000), { ok: false, error: "That code isn't valid." });
    assert.deepEqual(await previewDiscount("rule-off", 5000), { ok: false, error: "That code isn't valid." });
    assert.deepEqual(await previewDiscount("RULE-SOON", 5000), { ok: false, error: "That code isn't active yet." });
    assert.deepEqual(await previewDiscount("RULE-OVER", 5000), { ok: false, error: "That code has expired." });
  });

  test("a minimum spend is explained, and met codes return their amount", async () => {
    await coupon("RULE-MIN", { type: "fixed", value: 300, minSubtotal: 3000 });
    const short = await previewDiscount("RULE-MIN", 2999);
    assert.ok(!short.ok && /Spend ₹3,000 or more/.test(short.error));
    assert.deepEqual(await previewDiscount("rule-min", 3000), { ok: true, discount: { code: "RULE-MIN", description: "Test RULE-MIN", amount: 300 } });
  });

  test("the bag check prices a valid code and explains an invalid one", async () => {
    await coupon("RULE-BAG", { type: "fixed", value: 250 });
    const lines = [{ slug: CHINO, colour: item.colour, size: item.size, quantity: 1 }];
    const good = await checkCart(lines, "razorpay", "rule-bag");
    assert.ok(good.discount?.ok);
    assert.equal(good.totals.discount, 250);
    assert.equal(good.totals.total, computeTotals(item.unitPrice, "razorpay", 250).total);
    const bad = await checkCart(lines, "razorpay", "NOPE-123");
    assert.ok(bad.discount && !bad.discount.ok);
    assert.equal(bad.totals.discount, 0);
  });
});

describe("redeeming codes", () => {
  test("orders record the code and amount", async () => {
    await coupon("REDEEM-REC", { type: "fixed", value: 400 });
    const { id } = await orderWith("REDEEM-REC");
    const order = await getOrder(id);
    assert.equal(order?.discountCode, "REDEEM-REC");
    assert.equal(order?.discountAmount, 400);
    assert.equal(order?.total, computeTotals(item.unitPrice, "razorpay", 400).total);
  });

  test("a code with one use left is redeemed once, even by parallel orders; cancelling gives the use back", async () => {
    await coupon("REDEEM-ONE", { usageLimit: 1 });
    // Priced once up front, as each shopper's checkout would have been; only the orders race.
    const preview = await previewDiscount("REDEEM-ONE", item.unitPrice);
    assert.ok(preview.ok);
    const totals = computeTotals(item.unitPrice, "razorpay", preview.discount.amount);
    const results = await Promise.allSettled(
      [1, 2, 3, 4].map(() => createOrder({ customer: shopper(), items: [item], method: "razorpay", totals, discountCode: "REDEEM-ONE" })),
    );
    const placed = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>[];
    assert.equal(placed.length, 1);
    assert.ok(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof DiscountError));
    assert.deepEqual(await previewDiscount("REDEEM-ONE", item.unitPrice), { ok: false, error: "That code has been fully redeemed." });

    assert.ok(await cancelOrder(placed[0].value.id));
    assert.ok((await previewDiscount("REDEEM-ONE", item.unitPrice)).ok, "available again");
  });

  test("once-per-customer codes refuse a second use by the same email or phone", async () => {
    await coupon("REDEEM-MINE", { oncePerCustomer: true });
    const me = shopper();
    await orderWith("REDEEM-MINE", me);
    await assert.rejects(orderWith("REDEEM-MINE", { ...me, phone: "+919399999999" }), /already used this code/);
    await assert.rejects(orderWith("REDEEM-MINE", { ...shopper(), phone: me.phone }), /already used this code/);
    assert.ok(await orderWith("REDEEM-MINE"), "someone else can still use it");
  });

  test("returning items from a discounted order refunds what was paid for them, not the full price", async () => {
    await coupon("REDEEM-RETURN", { type: "percentage", value: 20 });
    const two = { ...item, quantity: 2 };
    const subtotal = two.unitPrice * 2;
    const preview = await previewDiscount("REDEEM-RETURN", subtotal);
    assert.ok(preview.ok);
    const amount = preview.discount.amount;
    const { id } = await createOrder({
      customer: shopper(),
      items: [two],
      method: "razorpay",
      totals: computeTotals(subtotal, "razorpay", amount),
      discountCode: "REDEEM-RETURN",
    });
    await db()`update orders set status = 'delivered', delivered_at = now() where id = ${id}`;
    const [line] = await db()`select id::text as id from order_items where order_id = ${id}`;
    const res = await createReturn(id, { items: [{ orderItemId: line.id, quantity: 1 }], reason: RETURN_REASONS[0], comment: "" });
    assert.ok(res.ok);
    const ret = await prisma().return.findUniqueOrThrow({ where: { id: res.id } });
    assert.equal(ret.amount, Math.round((item.unitPrice * (subtotal - amount)) / subtotal));
  });

  test("an order whose discount doesn't match the code's current value is refused", async () => {
    await coupon("REDEEM-MOVED", { type: "fixed", value: 100 });
    const totals = computeTotals(item.unitPrice, "razorpay", 999);
    await assert.rejects(
      createOrder({ customer: shopper(), items: [item], method: "razorpay", totals, discountCode: "REDEEM-MOVED" }),
      DiscountError,
    );
    await assert.rejects(createOrder({ customer: shopper(), items: [item], method: "razorpay", totals }), /needs a discount code/);
    assert.equal(await prisma().order.count({ where: { discountCode: "REDEEM-MOVED" } }), 0);
  });
});
