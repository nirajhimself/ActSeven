/**
 * Admin credentials check. The admin is disabled entirely until
 * ADMIN_PASSWORD is set to 12+ characters; the username is ADMIN_USER
 * (default "admin"). Uses only Web APIs so it also runs in Proxy.
 */

function constantTimeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export function isAdminEnabled() {
  return (process.env.ADMIN_PASSWORD ?? "").length >= 12;
}

export const adminUsername = () => process.env.ADMIN_USER || "admin";

/** Compares a sign-in attempt with the configured credentials (constant time, both always checked). */
export function checkAdminCredentials(username: unknown, password: unknown) {
  if (!isAdminEnabled() || typeof username !== "string" || typeof password !== "string") return false;
  const userOk = constantTimeEqual(username, adminUsername());
  const passOk = constantTimeEqual(password, process.env.ADMIN_PASSWORD ?? "");
  return userOk && passOk;
}

/** Name of the admin session cookie (scoped to /admin). */
export const ADMIN_COOKIE = "act_vii_admin";
