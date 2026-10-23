/**
 * HTTP Basic auth for /admin. Uses only Web APIs so it runs in Proxy and on
 * the server. Admin is disabled entirely until ADMIN_PASSWORD is set.
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

export function checkAdminAuth(authorization: string | null) {
  if (!isAdminEnabled() || !authorization?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(authorization.slice(6));
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  const userOk = constantTimeEqual(user, process.env.ADMIN_USER || "admin");
  const passOk = constantTimeEqual(pass, process.env.ADMIN_PASSWORD ?? "");
  return userOk && passOk;
}
