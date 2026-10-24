/**
 * Phase 4 tests: admin sign-in (sessions, lockout, audit), product
 * management, and Razorpay notifications (signature, de-duplication, amount
 * checks). Run with `npm test` (isolated in-memory database).
 */
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { adminSignIn, audit, endAdminSession, getAdminSession, lockoutMinutes, MAX_FAILURES } from "@/lib/server/admin-session";
import { isValidImageUrl, parseProductForm, saveProduct } from "@/lib/server/admin-products";
import { db } from "@/lib/server/db";
import { attachRazorpayOrder, createOrder, getOrder } from "@/lib/server/orders";
import { processRazorpayWebhook } from "@/lib/server/payments";
import { prisma } from "@/lib/server/prisma";
import { getCheckoutVariants, getPublicProduct, listProducts } from "@/lib/server/products";

const url = new URL(process.env.DATABASE_URL ?? "postgres://missing");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || process.env.ACT_VII_SAMPLE_DB !== "1") {
  throw new Error(`Refusing to run database tests against ${url.hostname}. Use \`npm test\` (isolated in-memory database).`);
}

const PASSWORD = "phase-four-admin-pass";
before(() => {
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec-test";
});
after(async () => {
  await prisma().$disconnect();
  await db().end();
});

describe("admin sign-in", () => {
  test("wrong credentials are refused and recorded; right ones create a session", async () => {
    const meta = { ip: "203.0.113.10" };
    const bad = await adminSignIn("admin", "nope", meta);
    assert.equal(bad.ok, false);
    const good = await adminSignIn("admin", PASSWORD, meta);
    assert.ok(good.ok);
    const session = await getAdminSession(good.token);
    assert.equal(session?.username, "admin");
    // Only a hash of the token is stored.
    assert.equal(await prisma().adminSession.count({ where: { id: good.token } }), 0);
    assert.equal(await prisma().adminLoginAttempt.count({ where: { ip: meta.ip } }), 2);
  });

  test(`${MAX_FAILURES} failures lock that address out, even with the right password`, async () => {
    const meta = { ip: "203.0.113.20" };
    for (let i = 0; i < MAX_FAILURES; i++) assert.equal((await adminSignIn("admin", `guess-${i}`, meta)).ok, false);
    assert.ok((await lockoutMinutes(meta.ip)) > 0);
    const locked = await adminSignIn("admin", PASSWORD, meta);
    assert.equal(locked.ok, false);
    assert.match((locked as { error: string }).error, /Too many failed attempts/);
    // Another address is unaffected.
    assert.ok((await adminSignIn("admin", PASSWORD, { ip: "203.0.113.21" })).ok);
  });

  test("sessions end on sign-out, on expiry, and when the admin username changes", async () => {
    const a = await adminSignIn("admin", PASSWORD, { ip: "203.0.113.30" });
    const b = await adminSignIn("admin", PASSWORD, { ip: "203.0.113.30" });
    const c = await adminSignIn("admin", PASSWORD, { ip: "203.0.113.30" });
    assert.ok(a.ok && b.ok && c.ok);
    await endAdminSession(a.token);
    assert.equal(await getAdminSession(a.token), null, "signed out");
    await prisma().adminSession.update({
      where: { id: createHash("sha256").update(b.token).digest("hex") },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    assert.equal(await getAdminSession(b.token), null, "expired");
    process.env.ADMIN_USER = "someone-else";
    try {
      assert.equal(await getAdminSession(c.token), null, "username changed");
    } finally {
      process.env.ADMIN_USER = "admin";
    }
    assert.equal(await getAdminSession("not-a-real-token"), null);
    assert.equal(await getAdminSession(undefined), null);
  });

  test("admin is unavailable without a strong password", async () => {
    process.env.ADMIN_PASSWORD = "short";
    try {
      const res = await adminSignIn("admin", "short", { ip: "203.0.113.40" });
      assert.equal(res.ok, false);
    } finally {
      process.env.ADMIN_PASSWORD = PASSWORD;
    }
  });

  test("changes are written to the audit log", async () => {
    await audit({ username: "admin", ip: "203.0.113.50" }, "test.action", "product", "42", { note: "hello" });
    const row = await prisma().adminAuditLog.findFirst({ where: { action: "test.action" } });
    assert.equal(row?.targetId, "42");
    assert.deepEqual(row?.detail, { note: "hello" });
  });
});

describe("product management", () => {
  let categoryId = 0;
  let colourIds: number[] = [];
  before(async () => {
    categoryId = (await prisma().category.findUniqueOrThrow({ where: { slug: "knitwear" } })).id;
    colourIds = (await prisma().colour.findMany({ where: { name: { in: ["Navy", "Ecru", "Black"] } }, orderBy: { name: "asc" } })).map((c) => c.id);
  });

  function form(fields: Record<string, string | string[]>) {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const value of [v].flat()) f.append(k, value);
    return f;
  }
  const base = () => ({
    name: "Test Overshirt",
    slug: "test-overshirt",
    categoryId: String(categoryId),
    price: "4,499",
    status: "draft",
    summary: "A test overshirt.",
    description: "A product created by the admin tests.",
    sizeSystem: "tops",
    colourIds: [String(colourIds[0]), String(colourIds[1])],
  });

  test("validation rejects bad input field by field", () => {
    const { errors } = parseProductForm(
      form({ ...base(), name: "", slug: "Not A Slug!", price: "-5", colourIds: [], "image.0.url": "javascript:alert(1)", "image.0.alt": "x" }),
    );
    assert.ok(errors.name && errors.slug && errors.price && errors.colourIds && errors.images);
    assert.deepEqual(parseProductForm(form(base())).errors, {});
  });

  test("image URLs must be https or a /public path", () => {
    assert.equal(isValidImageUrl("https://images.unsplash.com/photo-1"), true);
    assert.equal(isValidImageUrl("/products/linen.jpg"), true);
    assert.equal(isValidImageUrl("http://example.com/a.jpg"), false);
    assert.equal(isValidImageUrl("javascript:alert(1)"), false);
    assert.equal(isValidImageUrl("https://user:pass@example.com/a.jpg"), false);
    assert.equal(isValidImageUrl("/../secret.jpg"), false);
  });

  test("creating a product makes every colour × size variant with zero stock, hidden while draft", async () => {
    const res = await saveProduct(null, parseProductForm(form(base())).input);
    assert.ok(res.ok);
    const variants = await prisma().variant.findMany({ where: { productId: res.id }, include: { inventory: true } });
    assert.equal(variants.length, 12); // 2 colours × 6 sizes
    assert.ok(variants.every((v) => v.active && v.inventory?.quantity === 0 && /^A7-\d{3,}-[A-Z]+-\w+$/.test(v.sku)));
    assert.equal(await getPublicProduct("test-overshirt"), null, "drafts are not public");
  });

  test("a product can't go active without an image", async () => {
    const res = await saveProduct(null, parseProductForm(form({ ...base(), slug: "test-no-image", status: "active" })).input);
    assert.equal(res.ok, false);
    assert.ok(!res.ok && res.errors.images);
  });

  test("activating with an image publishes it; duplicate slugs are refused", async () => {
    const existing = await prisma().product.findUniqueOrThrow({ where: { slug: "test-overshirt" } });
    const fields = { ...base(), status: "active", "image.0.url": "https://images.unsplash.com/photo-test", "image.0.alt": "Overshirt on a hanger" };
    const res = await saveProduct(existing.id, parseProductForm(form(fields)).input);
    assert.ok(res.ok);
    assert.ok(await getPublicProduct("test-overshirt"));

    const dup = await saveProduct(null, parseProductForm(form({ ...fields, name: "Copy" })).input);
    assert.ok(!dup.ok && dup.errors.slug);
  });

  test("removing a colour switches its variants off (kept for order history); adding it back switches them on", async () => {
    const product = await prisma().product.findUniqueOrThrow({ where: { slug: "test-overshirt" } });
    const withImage = { ...base(), status: "active", "image.0.url": "https://images.unsplash.com/photo-test", "image.0.alt": "Overshirt on a hanger" };
    assert.ok((await saveProduct(product.id, parseProductForm(form({ ...withImage, colourIds: [String(colourIds[0])] })).input)).ok);
    const afterRemove = await prisma().variant.findMany({ where: { productId: product.id } });
    assert.equal(afterRemove.length, 12, "nothing deleted");
    assert.equal(afterRemove.filter((v) => v.active).length, 6);
    assert.equal((await getPublicProduct("test-overshirt"))?.colours.length, 1);

    // Re-add: the form still carries the switched-off variants unticked, but a re-added colour comes back on.
    const variantFields = Object.fromEntries(afterRemove.flatMap((v) => [[`variant.${v.id}.present`, "1"], ...(v.active ? [[`variant.${v.id}.active`, "on"]] : [])]));
    assert.ok((await saveProduct(product.id, parseProductForm(form({ ...withImage, ...variantFields })).input)).ok);
    assert.equal(await prisma().variant.count({ where: { productId: product.id, active: true } }), 12);
  });

  test("variant price overrides are used at checkout; an active product needs an active variant", async () => {
    const product = await prisma().product.findUniqueOrThrow({ where: { slug: "test-overshirt" } });
    const variants = await prisma().variant.findMany({ where: { productId: product.id }, include: { colour: true, size: true } });
    const target = variants.find((v) => v.size.label === "XL")!;
    const withImage = { ...base(), status: "active", "image.0.url": "https://images.unsplash.com/photo-test", "image.0.alt": "Overshirt on a hanger" };
    const variantFields = Object.fromEntries(
      variants.flatMap((v) => [[`variant.${v.id}.present`, "1"], [`variant.${v.id}.active`, "on"], ...(v.id === target.id ? [[`variant.${v.id}.price`, "4999"]] : [])]),
    );
    assert.ok((await saveProduct(product.id, parseProductForm(form({ ...withImage, ...variantFields })).input)).ok);
    const priced = (await getCheckoutVariants(["test-overshirt"])).get(`test-overshirt|${target.colour.name}|XL`);
    assert.equal(priced?.price, 4999);

    const allOff = Object.fromEntries(variants.map((v) => [`variant.${v.id}.present`, "1"]));
    const res = await saveProduct(product.id, parseProductForm(form({ ...withImage, ...allOff })).input);
    assert.ok(!res.ok && res.errors.variants);
  });

  test("archiving hides a product from the store", async () => {
    await prisma().product.update({ where: { slug: "test-overshirt" }, data: { status: "archived" } });
    assert.equal(await getPublicProduct("test-overshirt"), null);
    assert.ok(!(await listProducts({ pageSize: 100 })).items.some((p) => p.slug === "test-overshirt"));
  });
});

describe("Razorpay notifications", () => {
  const sign = (body: string) => createHmac("sha256", "whsec-test").update(body).digest("hex");
  const captured = (orderId: string, amount: number, currency = "INR") =>
    JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: `pay_${randomUUID().slice(0, 8)}`, order_id: orderId, amount, currency, status: "captured" } } } });

  async function onlineOrder(total: number) {
    const v = (await getCheckoutVariants(["merino-crew-neck"])).values().next().value!;
    await prisma().inventory.update({ where: { variantId: v.variantId }, data: { quantity: 50 } });
    const order = await createOrder({
      customer: { email: "pay@example.com", phone: "+919876543210", name: "Pay Test", address1: "1 Test Lane", address2: "", city: "Pune", state: "Maharashtra", pincode: "411001", giftNote: "" },
      items: [{ variantId: v.variantId, sku: v.sku, slug: v.slug, name: v.name, colour: v.colour, size: v.size, unitPrice: total, quantity: 1 }],
      method: "razorpay",
      totals: { subtotal: total, shipping: 0, codFee: 0, total },
    });
    const rzpOrderId = `order_${randomUUID().slice(0, 10)}`;
    await attachRazorpayOrder(order.id, rzpOrderId);
    return { id: order.id, rzpOrderId };
  }

  test("a forged signature is rejected and changes nothing", async () => {
    const { id, rzpOrderId } = await onlineOrder(3000);
    const res = await processRazorpayWebhook(captured(rzpOrderId, 300000), "0".repeat(64), "evt_forged");
    assert.equal(res.status, 400);
    assert.equal((await getOrder(id))?.status, "pending_payment");
    assert.equal(await prisma().paymentEvent.count({ where: { id: "evt_forged" } }), 0);
  });

  test("a matching payment marks the order paid; a repeated delivery is ignored", async () => {
    const { id, rzpOrderId } = await onlineOrder(3000);
    const body = captured(rzpOrderId, 300000);
    const first = await processRazorpayWebhook(body, sign(body), "evt_paid_1");
    assert.equal(first.status, 200);
    assert.equal((await getOrder(id))?.status, "paid");
    const payment = await prisma().payment.findFirstOrThrow({ where: { orderId: id } });
    assert.equal(payment.status, "captured");

    const again = await processRazorpayWebhook(body, sign(body), "evt_paid_1");
    assert.deepEqual(again.body, { received: true, duplicate: true });
    assert.equal((await prisma().paymentEvent.findUniqueOrThrow({ where: { id: "evt_paid_1" } })).outcome, "processed");
  });

  test("a payment for the wrong amount or currency doesn't mark the order paid", async () => {
    const { id, rzpOrderId } = await onlineOrder(3000);
    const short = captured(rzpOrderId, 100);
    const res = await processRazorpayWebhook(short, sign(short), "evt_short");
    assert.equal(res.status, 200, "acknowledged so Razorpay doesn't retry forever");
    assert.equal((await getOrder(id))?.status, "pending_payment");
    const event = await prisma().paymentEvent.findUniqueOrThrow({ where: { id: "evt_short" } });
    assert.equal(event.outcome, "rejected");
    assert.match(event.note ?? "", /amount mismatch/);

    const usd = captured(rzpOrderId, 300000, "USD");
    await processRazorpayWebhook(usd, sign(usd), "evt_usd");
    assert.equal((await getOrder(id))?.status, "pending_payment");
  });

  test("unknown events are acknowledged and recorded as ignored", async () => {
    const body = JSON.stringify({ event: "payment.dispute.created", payload: { payment: { entity: { id: "pay_x", order_id: "order_x" } } } });
    const res = await processRazorpayWebhook(body, sign(body), "evt_unknown");
    assert.equal(res.status, 200);
    assert.equal((await prisma().paymentEvent.findUniqueOrThrow({ where: { id: "evt_unknown" } })).outcome, "ignored");
  });
});
