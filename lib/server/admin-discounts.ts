import "server-only";
import { db } from "./db";
import { normaliseCode } from "./discounts";

/**
 * Admin management of coupon codes. Codes can't be renamed once created
 * (usage is counted from orders by code); switch a code off instead.
 */

export type AdminDiscount = {
  id: number;
  code: string;
  description: string;
  type: "percentage" | "fixed";
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  oncePerCustomer: boolean;
  active: boolean;
  /** Orders using the code that weren't cancelled, expired or failed. */
  used: number;
};

export type DiscountInput = Omit<AdminDiscount, "id" | "used">;
export type DiscountFieldErrors = Partial<Record<keyof DiscountInput | "form", string>>;

/** Where a code stands right now, for the list. */
export function discountState(d: Pick<AdminDiscount, "active" | "startsAt" | "endsAt" | "usageLimit" | "used">, now = new Date()) {
  if (!d.active) return "off" as const;
  if (d.endsAt && d.endsAt < now) return "expired" as const;
  if (d.usageLimit != null && d.used >= d.usageLimit) return "used up" as const;
  if (d.startsAt && d.startsAt > now) return "scheduled" as const;
  return "live" as const;
}

/** Every code (newest first, live ones on top), or the one with `id`. */
function selectDiscounts(id?: number) {
  const sql = db();
  return sql<Row[]>`
    select d.id, d.code, d.description, d.type, d.value, d.min_subtotal, d.max_discount, d.starts_at, d.ends_at,
           d.usage_limit, d.once_per_customer, d.active,
           (select count(*)::int from orders o
             where o.discount_code = d.code and o.status not in ('cancelled', 'expired', 'payment_failed')) as used
      from discounts d
     ${id === undefined ? sql`order by d.active desc, d.created_at desc` : sql`where d.id = ${id}`}`;
}

type Row = {
  id: number;
  code: string;
  description: string;
  type: "percentage" | "fixed";
  value: number;
  min_subtotal: number;
  max_discount: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  usage_limit: number | null;
  once_per_customer: boolean;
  active: boolean;
  used: number;
};

const toDiscount = (r: Row): AdminDiscount => ({
  id: r.id,
  code: r.code,
  description: r.description,
  type: r.type,
  value: r.value,
  minSubtotal: r.min_subtotal,
  maxDiscount: r.max_discount,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  usageLimit: r.usage_limit,
  oncePerCustomer: r.once_per_customer,
  active: r.active,
  used: r.used,
});

export async function listDiscounts(): Promise<AdminDiscount[]> {
  return (await selectDiscounts()).map(toDiscount);
}

export async function getDiscount(id: number): Promise<AdminDiscount | null> {
  const [row] = await selectDiscounts(id);
  return row ? toDiscount(row) : null;
}

/** "2026-10-27T10:30" from a datetime-local input, read as India time. */
function istDate(raw: FormDataEntryValue | null): Date | null | "invalid" {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return "invalid";
  const d = new Date(`${s}:00+05:30`);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

/** The value for a datetime-local input, in India time. */
export function istInputValue(d: Date | null) {
  if (!d) return "";
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

const whole = (raw: FormDataEntryValue | null) => {
  const s = String(raw ?? "").replace(/[,₹\s]/g, "");
  return s === "" ? null : /^\d+$/.test(s) ? Number(s) : NaN;
};

export function parseDiscountForm(form: FormData): { input: DiscountInput; errors: DiscountFieldErrors } {
  const errors: DiscountFieldErrors = {};
  const code = normaliseCode(form.get("code"));
  if (!code) errors.code = "Use 2–40 letters, digits, hyphens or underscores.";
  const description = String(form.get("description") ?? "").trim().slice(0, 200);
  if (!description) errors.description = "Describe the offer (customers see this when they apply the code).";
  const type = form.get("type") === "fixed" ? "fixed" : "percentage";
  const value = whole(form.get("value"));
  if (value == null || Number.isNaN(value) || value < 1) errors.value = "Enter a whole number above 0.";
  else if (type === "percentage" && value > 100) errors.value = "A percentage can't be more than 100.";
  else if (type === "fixed" && value > 1_000_000) errors.value = "That amount is too large.";
  const minSubtotal = whole(form.get("minSubtotal"));
  if (Number.isNaN(minSubtotal) || (minSubtotal ?? 0) > 10_000_000) errors.minSubtotal = "Enter a whole rupee amount, or leave it empty.";
  const maxDiscount = whole(form.get("maxDiscount"));
  if (Number.isNaN(maxDiscount) || maxDiscount === 0) errors.maxDiscount = "Enter a whole rupee amount above 0, or leave it empty.";
  const usageLimit = whole(form.get("usageLimit"));
  if (Number.isNaN(usageLimit) || usageLimit === 0) errors.usageLimit = "Enter a whole number above 0, or leave it empty.";
  const startsAt = istDate(form.get("startsAt"));
  const endsAt = istDate(form.get("endsAt"));
  if (startsAt === "invalid") errors.startsAt = "Enter a valid date and time.";
  if (endsAt === "invalid") errors.endsAt = "Enter a valid date and time.";
  if (startsAt instanceof Date && endsAt instanceof Date && endsAt <= startsAt) errors.endsAt = "The end must be after the start.";

  return {
    input: {
      code: code ?? "",
      description,
      type,
      value: value && !Number.isNaN(value) ? value : 0,
      minSubtotal: minSubtotal && !Number.isNaN(minSubtotal) ? minSubtotal : 0,
      maxDiscount: type === "percentage" && maxDiscount && !Number.isNaN(maxDiscount) ? maxDiscount : null,
      startsAt: startsAt instanceof Date ? startsAt : null,
      endsAt: endsAt instanceof Date ? endsAt : null,
      usageLimit: usageLimit && !Number.isNaN(usageLimit) ? usageLimit : null,
      oncePerCustomer: form.get("oncePerCustomer") === "on",
      active: form.get("active") === "on",
    },
    errors,
  };
}

/** Creates (id null) or updates a code. The code itself is fixed after creation. */
export async function saveDiscount(id: number | null, d: DiscountInput): Promise<{ ok: true; id: number } | { ok: false; errors: DiscountFieldErrors }> {
  const sql = db();
  if (id === null) {
    try {
      const [row] = await sql`
        insert into discounts (code, description, type, value, min_subtotal, max_discount, starts_at, ends_at, usage_limit, once_per_customer, active)
        values (${d.code}, ${d.description}, ${d.type}, ${d.value}, ${d.minSubtotal}, ${d.maxDiscount}, ${d.startsAt}, ${d.endsAt},
                ${d.usageLimit}, ${d.oncePerCustomer}, ${d.active})
        returning id`;
      return { ok: true, id: row.id };
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return { ok: false, errors: { code: "That code already exists." } };
      throw err;
    }
  }
  const rows = await sql`
    update discounts set description = ${d.description}, type = ${d.type}, value = ${d.value}, min_subtotal = ${d.minSubtotal},
           max_discount = ${d.maxDiscount}, starts_at = ${d.startsAt}, ends_at = ${d.endsAt}, usage_limit = ${d.usageLimit},
           once_per_customer = ${d.oncePerCustomer}, active = ${d.active}
     where id = ${id} returning id`;
  return rows.length ? { ok: true, id } : { ok: false, errors: { form: "That code no longer exists." } };
}
