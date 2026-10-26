import "server-only";
import { headers } from "next/headers";

/**
 * The client's address, for rate limits, lockouts and audit. On Vercel the
 * platform overwrites X-Forwarded-For, so its first hop is the real client;
 * behind a host that passes the header through, it can be spoofed.
 */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
