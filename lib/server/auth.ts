import "server-only";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { db, isDatabaseConfigured } from "./db";

export const SESSION_COOKIE = "act_vii_session";
const SESSION_DAYS = 30;
const CODE_TTL_MINUTES = 10;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export type Customer = { id: string; email: string; name: string | null; phone: string | null };

export function isAuthConfigured() {
  return isDatabaseConfigured() && (process.env.AUTH_SECRET ?? "").length >= 32;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hashCode = (email: string, code: string) =>
  createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`${email}:${code}`).digest("hex");

export function normaliseEmail(raw: unknown) {
  const email = typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 254) : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Issues a 6-digit code. Returns the code for delivery, or a reason it wasn't issued. */
export async function issueLoginCode(email: string): Promise<{ ok: true; code: string } | { ok: false; reason: "rate_limited" }> {
  const sql = db();
  const [{ recent }] = await sql`
    select count(*)::int as recent from login_codes where email = ${email} and created_at > now() - interval '1 hour'`;
  if (recent >= MAX_CODES_PER_HOUR) return { ok: false, reason: "rate_limited" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // A new code supersedes any earlier unused ones.
  await sql`update login_codes set consumed_at = now() where email = ${email} and consumed_at is null`;
  await sql`
    insert into login_codes (email, code_hash, expires_at)
    values (${email}, ${hashCode(email, code)}, now() + ${`${CODE_TTL_MINUTES} minutes`}::interval)`;
  return { ok: true, code };
}

/** Verifies a code; on success creates the customer (if new) and a session cookie. */
export async function verifyLoginCode(email: string, code: string): Promise<{ ok: true } | { ok: false; reason: "invalid" | "expired" | "locked" }> {
  const sql = db();
  const [row] = await sql`
    select id, code_hash, attempts, expires_at > now() as live
      from login_codes
     where email = ${email} and consumed_at is null
     order by created_at desc limit 1`;
  if (!row || !row.live) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };

  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(hashCode(email, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await sql`update login_codes set attempts = attempts + 1 where id = ${row.id}`;
    return { ok: false, reason: row.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "invalid" };
  }

  // Consume atomically so a code can't be used twice in a race.
  const consumed = await sql`update login_codes set consumed_at = now() where id = ${row.id} and consumed_at is null returning id`;
  if (consumed.length === 0) return { ok: false, reason: "expired" };

  const [customer] = await sql`
    insert into customers (id, email) values (${randomUUID()}, ${email})
    on conflict (email) do update set updated_at = now()
    returning id`;

  const token = randomBytes(32).toString("base64url");
  await sql`
    insert into sessions (id, customer_id, expires_at)
    values (${sha256(token)}, ${customer.id}, now() + ${`${SESSION_DAYS} days`}::interval)`;
  // Housekeeping: drop this customer's expired sessions.
  await sql`delete from sessions where customer_id = ${customer.id} and expires_at < now()`;

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return { ok: true };
}

/** The signed-in customer for this request, or null. Deduplicated per request. */
export const getCurrentCustomer = cache(async (): Promise<Customer | null> => {
  if (!isAuthConfigured()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [row] = await db()`
    select c.id, c.email, c.name, c.phone
      from sessions s join customers c on c.id = s.customer_id
     where s.id = ${sha256(token)} and s.expires_at > now()`;
  return row ? { id: row.id, email: row.email, name: row.name, phone: row.phone } : null;
});

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token && isDatabaseConfigured()) await db()`delete from sessions where id = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}
