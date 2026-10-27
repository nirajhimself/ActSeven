import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminUsername, checkAdminCredentials, isAdminEnabled } from "@/lib/admin-auth";
import type postgres from "postgres";
import { db as sqlDb } from "./db";
import { prisma, withReadRetry } from "./prisma";

/**
 * Admin sign-in sessions, lockout and audit log (database-backed).
 * Only a SHA-256 of the session token is stored; the raw token lives in an
 * httpOnly cookie scoped to /admin.
 */

export const SESSION_HOURS = 8;
/** Failed sign-ins allowed from one address within the window before it's locked out. */
export const MAX_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;
/** Failed sign-ins allowed from all addresses together within the window (stops distributed guessing). */
export const GLOBAL_MAX_FAILURES = 50;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type AdminMeta = { ip: string; userAgent?: string | null };

/**
 * Both lockouts in one round trip: this address's failures since its last
 * successful sign-in (a success clears the lock), and failures from every
 * address, within the lockout window.
 */
async function lockoutState(sql: postgres.Sql | postgres.TransactionSql, ip: string) {
  const [row] = await sql<{ ipFailures: number; lastFailure: Date | null; allFailures: number }[]>`
    with recent as (
      select ip, success, attempted_at from admin_login_attempts
       where attempted_at >= now() - ${`${LOCKOUT_MINUTES} minutes`}::interval
    )
    select
      (select count(*)::int from recent r
        where r.ip = ${ip} and not r.success
          and r.attempted_at > coalesce((select max(s.attempted_at) from recent s where s.ip = ${ip} and s.success), '-infinity'::timestamptz)
      ) as "ipFailures",
      (select max(attempted_at) from recent where ip = ${ip} and not success) as "lastFailure",
      (select count(*)::int from recent where not success) as "allFailures"`;
  const ipWait =
    row.ipFailures >= MAX_FAILURES && row.lastFailure
      ? Math.max(1, Math.ceil((row.lastFailure.getTime() + LOCKOUT_MINUTES * 60_000 - Date.now()) / 60_000))
      : 0;
  return { ipWait, allFailures: row.allFailures };
}

/** Minutes until an address may try again, or 0 if it isn't locked out. */
export async function lockoutMinutes(ip: string): Promise<number> {
  return (await lockoutState(sqlDb(), ip)).ipWait;
}

export type SignInResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error: string };

export async function adminSignIn(username: unknown, password: unknown, meta: AdminMeta): Promise<SignInResult> {
  if (!isAdminEnabled()) return { ok: false, error: "The admin is turned off. Set ADMIN_PASSWORD (12+ characters) to enable it." };

  // Check the lockouts and record the attempt under one lock, so a burst of
  // parallel guesses is counted one by one instead of all passing the check.
  // Plain SQL with three round trips: an interactive Prisma transaction with
  // more steps overran its time limit against a distant database.
  const outcome = await sqlDb().begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtext('admin_sign_in'))`;
    const { ipWait, allFailures } = await lockoutState(sql, meta.ip);
    if (ipWait > 0) return { wait: ipWait };
    if (allFailures >= GLOBAL_MAX_FAILURES) return { wait: LOCKOUT_MINUTES };
    const ok = checkAdminCredentials(username, password);
    await sql`insert into admin_login_attempts (ip, success) values (${meta.ip}, ${ok})`;
    return { ok };
  });
  const db = prisma();
  if (outcome.wait) {
    return { ok: false, error: `Too many failed attempts. Try again in ${outcome.wait} minute${outcome.wait === 1 ? "" : "s"}.` };
  }
  if (!outcome.ok) return { ok: false, error: "That username and password don't match." };

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  await db.adminSession.create({
    data: { id: sha256(token), username: adminUsername(), ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null, expiresAt },
  });
  // Housekeeping: drop expired sessions and old attempts.
  await Promise.all([
    db.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    db.adminLoginAttempt.deleteMany({ where: { attemptedAt: { lt: new Date(Date.now() - 24 * 3_600_000) } } }),
  ]).catch(() => {});
  await audit({ username: adminUsername(), ip: meta.ip }, "admin.sign_in", "admin", null);
  return { ok: true, token, expiresAt };
}

/** The signed-in admin for a session token, or null if it's missing, unknown or expired. */
export async function getAdminSession(token: string | undefined | null) {
  if (!token || token.length > 200 || !isAdminEnabled()) return null;
  const session = await withReadRetry(() => prisma().adminSession.findUnique({ where: { id: sha256(token) } }));
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  // A changed ADMIN_USER invalidates existing sessions.
  if (session.username !== adminUsername()) return null;
  return { username: session.username, ip: session.ip, expiresAt: session.expiresAt };
}

export async function endAdminSession(token: string | undefined | null) {
  if (token) await prisma().adminSession.deleteMany({ where: { id: sha256(token) } });
}

/** Records an admin change. Never throws: a logging failure must not undo the change. */
export async function audit(
  who: { username: string; ip?: string | null },
  action: string,
  targetType: string,
  targetId: string | null,
  detail?: Record<string, unknown>,
) {
  await prisma()
    .adminAuditLog.create({
      data: { username: who.username, ip: who.ip ?? null, action, targetType, targetId, detail: detail ? JSON.parse(JSON.stringify(detail)) : undefined },
    })
    .catch((err) => console.error("[admin] audit log failed", err));
}

export async function recentAudit(limit = 20) {
  return prisma().adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
