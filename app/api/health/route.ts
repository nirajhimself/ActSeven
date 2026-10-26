import { connection } from "next/server";
import { checkConfig, hasErrors } from "@/lib/server/config";
import { db, isDatabaseConfigured, resetDb } from "@/lib/server/db";

/**
 * Health check for uptime monitors: GET /api/health → 200 "ok" or 503
 * "degraded". It reveals no configuration details — those are listed on
 * the admin overview, behind sign-in.
 */
export async function GET() {
  await connection(); // always run live, never from a cached build
  let database: "ok" | "unreachable" | "not configured" = "not configured";
  if (isDatabaseConfigured()) {
    try {
      await Promise.race([db()`select 1`, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))]);
      database = "ok";
    } catch {
      database = "unreachable";
      // A fresh pool lets the store recover without a restart; uptime
      // monitors polling this route make that automatic.
      resetDb();
    }
  }
  const configOk = !hasErrors(checkConfig());
  const ok = database === "ok" && configOk;
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      database,
      config: configOk ? "ok" : "needs attention",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
