/** Phase 5: production configuration checks (pure — no database needed). */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkConfig, hasErrors } from "@/lib/server/config";
import { startDbWatchdog, stopDbWatchdog } from "@/lib/server/db-watchdog";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
  AUTH_SECRET: "x".repeat(44),
  ADMIN_PASSWORD: "Correct-Horse-Battery-9",
  NEXT_PUBLIC_SITE_URL: "https://actvii.in",
  RAZORPAY_KEY_ID: "rzp_test_abc123",
  RAZORPAY_KEY_SECRET: "secret",
  RAZORPAY_WEBHOOK_SECRET: "whsec",
  RESEND_API_KEY: "re_x",
  EMAIL_FROM: "ACT VII <orders@actvii.in>",
  CRON_SECRET: "c".repeat(24),
};
const keys = (env: Record<string, string | undefined>, level: "error" | "warning") =>
  checkConfig(env)
    .filter((f) => f.level === level)
    .map((f) => f.key)
    .sort();

describe("production configuration", () => {
  test("a complete setup has nothing to report", () => {
    assert.deepEqual(checkConfig(good), []);
  });

  test("missing essentials are errors", () => {
    const env = { ...good, DATABASE_URL: "", AUTH_SECRET: "short", NEXT_PUBLIC_SITE_URL: "http://actvii.in" };
    assert.deepEqual(keys(env, "error"), ["AUTH_SECRET", "DATABASE_URL", "NEXT_PUBLIC_SITE_URL"]);
    assert.equal(hasErrors(checkConfig(env)), true);
  });

  test("localhost and placeholder values are caught in production", () => {
    assert.ok(keys({ ...good, NEXT_PUBLIC_SITE_URL: "https://localhost:3000" }, "error").includes("NEXT_PUBLIC_SITE_URL"));
    assert.ok(keys({ ...good, DATABASE_URL: "postgres://postgres:YOUR_PASSWORD@db/x" }, "error").includes("DATABASE_URL"));
  });

  test("half-configured Razorpay is an error; none at all is only a warning", () => {
    assert.ok(keys({ ...good, RAZORPAY_KEY_SECRET: "" }, "error").includes("RAZORPAY_KEY_SECRET"));
    const none = { ...good, RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "" };
    assert.equal(hasErrors(checkConfig(none)), false);
    assert.ok(keys(none, "warning").includes("RAZORPAY_KEY_ID"));
    assert.ok(keys({ ...good, RAZORPAY_KEY_ID: "pk_live_123" }, "error").includes("RAZORPAY_KEY_ID"));
  });

  test("live keys outside production and a weak admin password are flagged", () => {
    assert.ok(keys({ ...good, NODE_ENV: "development", RAZORPAY_KEY_ID: "rzp_live_abc" }, "warning").includes("RAZORPAY_KEY_ID"));
    assert.ok(keys({ ...good, ADMIN_PASSWORD: "short" }, "error").includes("ADMIN_PASSWORD"));
    assert.ok(keys({ ...good, ADMIN_PASSWORD: "aaaaaaaaaaaaaa" }, "warning").includes("ADMIN_PASSWORD"));
  });

  test("missing email is an error in production (sign-in needs it) and a warning in development", () => {
    assert.ok(keys({ ...good, EMAIL_FROM: "" }, "error").includes("RESEND_API_KEY"));
    assert.ok(keys({ ...good, NODE_ENV: "development", RESEND_API_KEY: "" }, "warning").includes("RESEND_API_KEY"));
  });

  test("the database watchdog replaces clients that stop answering, and leaves healthy ones alone", async () => {
    const hung = () => new Promise(() => {});
    const ended: string[] = [];
    const stuckSql = Object.assign(() => hung(), { end: async () => void ended.push("sql") });
    const stuckPrisma = { $queryRaw: () => hung(), $disconnect: async () => void ended.push("prisma") };
    globalThis.__actViiSql = stuckSql as unknown as typeof globalThis.__actViiSql;
    globalThis.__actViiPrisma = stuckPrisma as unknown as typeof globalThis.__actViiPrisma;
    startDbWatchdog({ everyMs: 20, answerWithinMs: 30 });
    try {
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(globalThis.__actViiSql, undefined, "postgres.js pool discarded");
      assert.equal(globalThis.__actViiPrisma, undefined, "Prisma client discarded");
      assert.deepEqual(ended.sort(), ["prisma", "sql"]);

      const healthy = Object.assign(async () => [{ "?column?": 1 }], { end: async () => void ended.push("healthy") });
      globalThis.__actViiSql = healthy as unknown as typeof globalThis.__actViiSql;
      await new Promise((r) => setTimeout(r, 120));
      assert.equal(globalThis.__actViiSql, healthy as unknown as typeof globalThis.__actViiSql, "a healthy pool is kept");
    } finally {
      stopDbWatchdog();
      globalThis.__actViiSql = undefined;
      globalThis.__actViiPrisma = undefined;
    }
  });

  test("findings never contain secret values", () => {
    const secretish = { ...good, ADMIN_PASSWORD: "s3cr3t-val", AUTH_SECRET: "tiny-secret-value", RAZORPAY_KEY_SECRET: "" };
    const text = JSON.stringify(checkConfig(secretish));
    for (const value of ["s3cr3t-val", "tiny-secret-value", "pw@aws", "rzp_test_abc123"]) assert.ok(!text.includes(value), value);
  });
});
