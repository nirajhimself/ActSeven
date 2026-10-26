import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminUsername, checkAdminCredentials, isAdminEnabled } from "@/lib/admin-auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

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

/** Minutes until an address may try again, or 0 if it isn't locked out. */
export async function lockoutMinutes(ip: string, db: Prisma.TransactionClient = prisma()): Promise<number> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000);
  const failures = await db.adminLoginAttempt.findMany({
    where: { ip, success: false, attemptedAt: { gte: since } },
    orderBy: { attemptedAt: "desc" },
    take: MAX_FAILURES,
    select: { attemptedAt: true },
  });
  if (failures.length < MAX_FAILURES) return 0;
  // A successful sign-in after the failures clears the lock.
  const success = await db.adminLoginAttempt.findFirst({
    where: { ip, success: true, attemptedAt: { gt: failures[failures.length - 1].attemptedAt } },
    select: { id: true },
  });
  if (success) return 0;
  const unlockAt = failures[0].attemptedAt.getTime() + LOCKOUT_MINUTES * 60_000;
  return Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
}

export type SignInResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error: string };

export async function adminSignIn(username: unknown, password: unknown, meta: AdminMeta): Promise<SignInResult> {
  if (!isAdminEnabled()) return { ok: false, error: "The admin is turned off. Set ADMIN_PASSWORD (12+ characters) to enable it." };

  // Check the lockouts and record the attempt under one lock, so a burst of
  // parallel guesses is counted one by one instead of all passing the check.
  const db = prisma();
  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('admin_sign_in'))`;
    const wait = await lockoutMinutes(meta.ip, tx);
    if (wait > 0) return { wait };
    const recentFailures = await tx.adminLoginAttempt.count({
      where: { success: false, attemptedAt: { gte: new Date(Date.now() - LOCKOUT_MINUTES * 60_000) } },
    });
    if (recentFailures >= GLOBAL_MAX_FAILURES) return { wait: LOCKOUT_MINUTES };
    const ok = checkAdminCredentials(username, password);
    await tx.adminLoginAttempt.create({ data: { ip: meta.ip, success: ok } });
    return { ok };
  });
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
  const session = await prisma().adminSession.findUnique({ where: { id: sha256(token) } });
  if (!session || session.expiresAt <= new Date()) return null;
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
