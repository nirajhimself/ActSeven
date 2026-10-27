import "server-only";
import type postgres from "postgres";
import { discountFor } from "@/lib/pricing";
import { formatINR } from "@/lib/format";
import { db } from "./db";

/**
 * Coupon codes. Every rule is checked on the server: a preview for the
 * checkout summary, then again inside the order transaction (under a lock
 * per code), so a limited code can't be redeemed past its limit by orders
 * placed at the same moment. Usage is counted from orders, so a cancelled,
 * expired or failed order gives its use back.
 */

export type AppliedDiscount = { code: string; description: string; amount: number };
export type DiscountResult = { ok: true; discount: AppliedDiscount } | { ok: false; error: string };

type Rule = {
  id: number;
  code: string;
  description: string;
  type: string;
  value: number;
  min_subtotal: number;
  max_discount: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  usage_limit: number | null;
  once_per_customer: boolean;
  active: boolean;
};

/** Thrown inside the order transaction when a code can no longer be used. */
export class DiscountError extends Error {}


/** Upper-cased code, or null if it can't be one (letters, digits, - and _; up to 40). */
export function normaliseCode(raw: unknown): string | null {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return /^[A-Z0-9_-]{2,40}$/.test(code) ? code : null;
}

const INVALID = "That code isn't valid.";

/** The rules that don't depend on other orders. */
function ruleError(rule: Rule | undefined, subtotal: number, now = new Date()): string | null {
  if (!rule || !rule.active) return INVALID;
  if (rule.starts_at && rule.starts_at > now) return "That code isn't active yet.";
  if (rule.ends_at && rule.ends_at < now) return "That code has expired.";
  if (subtotal < rule.min_subtotal) return `Spend ${formatINR(rule.min_subtotal)} or more to use this code.`;
  return null;
}

const applied = (rule: Rule, subtotal: number): AppliedDiscount => ({
  code: rule.code,
  description: rule.description,
  amount: discountFor({ type: rule.type, value: rule.value, maxDiscount: rule.max_discount }, subtotal),
});

async function loadRule(sql: postgres.Sql | postgres.TransactionSql, code: string) {
  const [rule] = await sql<Rule[]>`
    select id, code, description, type, value, min_subtotal, max_discount, starts_at, ends_at, usage_limit, once_per_customer, active
      from discounts where code = ${code}`;
  return rule;
}

async function usageError(
  sql: postgres.Sql | postgres.TransactionSql,
  rule: Rule,
  who?: { email: string; phone: string },
): Promise<string | null> {
  if (rule.usage_limit != null) {
    const [{ used }] = await sql`
      select count(*)::int as used from orders where discount_code = ${rule.code} and status not in ('cancelled', 'expired', 'payment_failed')`;
    if (used >= rule.usage_limit) return "That code has been fully redeemed.";
  }
  if (rule.once_per_customer && who) {
    const [{ mine }] = await sql`
      select count(*)::int as mine from orders
       where discount_code = ${rule.code} and status not in ('cancelled', 'expired', 'payment_failed')
         and (lower(email) = lower(${who.email}) or phone = ${who.phone})`;
    if (mine > 0) return "You've already used this code.";
  }
  return null;
}

/**
 * Checks a code against a product subtotal for the checkout summary. Without
 * `who`, the once-per-customer rule is left for order placement.
 */
export async function previewDiscount(rawCode: unknown, subtotal: number, who?: { email: string; phone: string }): Promise<DiscountResult> {
  const code = normaliseCode(rawCode);
  if (!code) return { ok: false, error: INVALID };
  const sql = db();
  const rule = await loadRule(sql, code);
  const error = ruleError(rule, subtotal) ?? (await usageError(sql, rule!, who));
  return error ? { ok: false, error } : { ok: true, discount: applied(rule!, subtotal) };
}

/**
 * Inside the order transaction: locks the code, re-checks every rule and
 * returns the discount. Throws DiscountError if it can't be used, or if its
 * amount differs from what the shopper was shown (`expectedAmount`).
 */
export async function claimDiscount(
  tx: postgres.TransactionSql,
  code: string,
  subtotal: number,
  who: { email: string; phone: string },
  expectedAmount: number,
): Promise<AppliedDiscount> {
  await tx`select pg_advisory_xact_lock(hashtext(${`discount:${code}`}))`;
  const rule = await loadRule(tx, code);
  const error = ruleError(rule, subtotal) ?? (await usageError(tx, rule!, who));
  if (error) throw new DiscountError(error);
  const result = applied(rule!, subtotal);
  if (result.amount !== expectedAmount) throw new DiscountError("This code's value has changed. Please review your order and try again.");
  return result;
}
