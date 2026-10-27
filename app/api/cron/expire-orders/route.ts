import { timingSafeEqual } from "node:crypto";
import { isDatabaseConfigured } from "@/lib/server/db";
import { revalidateTag } from "next/cache";
import { CATALOG_TAG } from "@/lib/server/catalog";
import { expireStalePendingOrders } from "@/lib/server/inventory";

/**
 * Releases stock held by abandoned online payments. Called by Vercel Cron
 * (vercel.json: daily on Hobby; every 15 min is better on Pro) with header
 * `Authorization: Bearer <CRON_SECRET>`. Checkout and the admin orders page
 * also run the same sweep as they go.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok =
    secret.length >= 16 &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response("Unauthorized", { status: 401 });
  if (!isDatabaseConfigured()) return new Response("Database not configured", { status: 503 });

  const expired = await expireStalePendingOrders();
  if (expired > 0) revalidateTag(CATALOG_TAG, "max");
  return Response.json({ expired });
}
