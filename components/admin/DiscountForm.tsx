"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { saveDiscountAction } from "@/app/admin/discounts/actions";
import type { DiscountFieldErrors } from "@/lib/server/admin-discounts";

export type EditableDiscount = {
  id: number | null;
  code: string;
  description: string;
  type: "percentage" | "fixed";
  value: number | null;
  minSubtotal: number;
  maxDiscount: number | null;
  /** datetime-local values, India time. */
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  oncePerCustomer: boolean;
  active: boolean;
};

const input =
  "block min-h-11 w-full border border-obsidian/20 bg-ivory px-3 text-sm outline-none focus:border-obsidian aria-invalid:border-[#9b2c1f]";

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="mt-1 text-[0.6875rem] text-taupe">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-[#9b2c1f]">{error}</p> : null}
    </div>
  );
}

export function DiscountForm({ discount }: { discount: EditableDiscount }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<DiscountFieldErrors>({});
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState(discount.type);
  const isNew = discount.id === null;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveDiscountAction(data);
      if (res?.errors) {
        setErrors(res.errors);
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[role=alert]")?.focus());
      }
    });
  };

  const errorList = Object.entries(errors).filter(([, v]) => v);

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-8" noValidate>
      {discount.id ? <input type="hidden" name="discountId" value={discount.id} /> : null}

      {errorList.length ? (
        <div role="alert" tabIndex={-1} className="border border-[#9b2c1f]/40 bg-[#9b2c1f]/5 px-4 py-3 text-sm text-[#9b2c1f] outline-none">
          <p className="font-medium">Please fix the following:</p>
          <ul className="mt-1 list-disc pl-5">
            {errorList.map(([k, v]) => (
              <li key={k}>{v}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" error={errors.code} hint={isNew ? "Letters, digits, - and _. Customers type it at checkout (any case)." : "Codes can't be renamed; switch this one off and create another instead."}>
          {(id) => (
            <input
              id={id}
              name="code"
              defaultValue={discount.code}
              readOnly={!isNew}
              required
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(errors.code)}
              className={`${input} uppercase ${isNew ? "" : "bg-bone/60 text-taupe"}`}
            />
          )}
        </Field>
        <Field label="Description" error={errors.description} hint="Shown to the customer when the code is applied.">
          {(id) => <input id={id} name="description" defaultValue={discount.description} required maxLength={200} aria-invalid={Boolean(errors.description)} className={input} />}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type">
          {(id) => (
            <select id={id} name="type" value={type} onChange={(e) => setType(e.target.value === "fixed" ? "fixed" : "percentage")} className={input}>
              <option value="percentage">Percentage off</option>
              <option value="fixed">Fixed amount off (₹)</option>
            </select>
          )}
        </Field>
        <Field label={type === "percentage" ? "Percent off" : "Rupees off"} error={errors.value}>
          {(id) => (
            <input id={id} name="value" inputMode="numeric" defaultValue={discount.value ?? ""} required aria-invalid={Boolean(errors.value)} className={input} />
          )}
        </Field>
        {type === "percentage" ? (
          <Field label="Maximum discount (₹)" error={errors.maxDiscount} hint="Optional cap.">
            {(id) => <input id={id} name="maxDiscount" inputMode="numeric" defaultValue={discount.maxDiscount ?? ""} aria-invalid={Boolean(errors.maxDiscount)} className={input} />}
          </Field>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Minimum spend (₹)" error={errors.minSubtotal} hint="Products only, before the discount. Empty for none.">
          {(id) => <input id={id} name="minSubtotal" inputMode="numeric" defaultValue={discount.minSubtotal || ""} aria-invalid={Boolean(errors.minSubtotal)} className={input} />}
        </Field>
        <Field label="Starts (India time)" error={errors.startsAt} hint="Empty: straight away.">
          {(id) => <input id={id} name="startsAt" type="datetime-local" defaultValue={discount.startsAt} aria-invalid={Boolean(errors.startsAt)} className={input} />}
        </Field>
        <Field label="Ends (India time)" error={errors.endsAt} hint="Empty: no end date.">
          {(id) => <input id={id} name="endsAt" type="datetime-local" defaultValue={discount.endsAt} aria-invalid={Boolean(errors.endsAt)} className={input} />}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Total uses allowed" error={errors.usageLimit} hint="Across all customers. Empty for unlimited.">
          {(id) => <input id={id} name="usageLimit" inputMode="numeric" defaultValue={discount.usageLimit ?? ""} aria-invalid={Boolean(errors.usageLimit)} className={input} />}
        </Field>
        <div className="flex flex-col justify-center gap-3 text-sm sm:col-span-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="oncePerCustomer" defaultChecked={discount.oncePerCustomer} className="size-4 accent-obsidian" />
            Once per customer (matched by email or mobile number)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="active" defaultChecked={discount.active} className="size-4 accent-obsidian" />
            Active (customers can use it within its dates)
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-obsidian/10 pt-6">
        <button type="submit" disabled={pending} className="label min-h-12 bg-obsidian px-8 text-ivory hover:bg-graphite disabled:opacity-45">
          {pending ? "Saving…" : isNew ? "Create code" : "Save changes"}
        </button>
        {errors.form ? <span className="text-xs text-[#9b2c1f]">{errors.form}</span> : null}
      </div>
    </form>
  );
}
