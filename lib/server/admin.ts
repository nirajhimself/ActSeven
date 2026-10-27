import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ADMIN_COOKIE, isAdminEnabled } from "@/lib/admin-auth";
import { audit, getAdminSession } from "./admin-session";
import { clientIp } from "./client-ip";

export { clientIp };

/**
 * Server-side admin check for every admin page and action (proxy.ts only
 * checks that a cookie is present). Redirects to sign-in without a valid
 * session; returns the admin and a helper that records changes.
 */
export async function requireAdmin() {
  // Read the request first: this makes every admin page render per request,
  // so build-time settings (e.g. no ADMIN_PASSWORD at build) are never baked in.
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!isAdminEnabled()) notFound();
  // Admin pages are private and live: never render them in a (runtime)
  // prerender, where checking the session's expiry against the clock fails.
  await connection();
  const session = await getAdminSession(token);
  if (!session) redirect("/admin/login");
  const ip = await clientIp();
  return {
    username: session.username,
    audit: (action: string, targetType: string, targetId: string | null, detail?: Record<string, unknown>) =>
      audit({ username: session.username, ip }, action, targetType, targetId, detail),
  };
}
