"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { confirmRazorpayPayment, placeOrder, placeTestOrder, type CheckoutFields } from "@/app/checkout/actions";
import { LineIssue } from "@/components/cart/CartLines";
import { ReviewBagNote } from "@/components/cart/CartSummary";
import { useCatalog } from "@/components/catalog/CatalogProvider";
import { useCartCheck, withLivePrices } from "@/lib/use-cart-check";
import { ButtonLink } from "@/components/ui/Button";
import { ArrowRightIcon, ShieldIcon } from "@/components/ui/Icons";
import { clearCart, resolveLines, useCart } from "@/lib/cart";
import { formatINR } from "@/lib/format";
import { indianStates, PHONE_PATTERN, PINCODE_PATTERN } from "@/lib/india";
import { codAvailable, computeTotals, type PaymentMethod } from "@/lib/pricing";
import type { Address } from "@/lib/server/customers";
import { policy } from "@/lib/site";
import { useHydrated } from "@/lib/store";

/** sessionStorage key for the receipt shown on /checkout/test-order. */
export const TEST_RECEIPT_KEY = "act-vii:test-order";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(Boolean(window.Razorpay));
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const ATTEMPT_KEY = "act-vii:checkout-attempt";

/**
 * Idempotency token for placing this order: a random id kept for the browser
 * session plus a fingerprint of the bag and payment method. Retrying the same
 * order reuses the token (so the server returns the order it already made);
 * changing the bag gives a new one.
 */
function checkoutToken(lines: { slug: string; colour: string; size: string; quantity: number }[], method: PaymentMethod) {
  let base = "";
  try {
    base = sessionStorage.getItem(ATTEMPT_KEY) ?? "";
    if (!base) sessionStorage.setItem(ATTEMPT_KEY, (base = crypto.randomUUID().replace(/-/g, "")));
  } catch {
    base = crypto.randomUUID().replace(/-/g, "");
  }
  const fingerprint = JSON.stringify([method, lines.map((l) => [l.slug, l.colour, l.size, l.quantity])]);
  let hash = 2166136261; // FNV-1a
  for (let i = 0; i < fingerprint.length; i++) hash = Math.imul(hash ^ fingerprint.charCodeAt(i), 16777619) >>> 0;
  return `${base}-${hash.toString(36)}`;
}

const COUPON_KEY = "act-vii:coupon";
const couponListeners = new Set<() => void>();
let couponMemo: string | null | undefined;

function readCoupon() {
  if (couponMemo === undefined) {
    try {
      couponMemo = sessionStorage.getItem(COUPON_KEY);
    } catch {
      couponMemo = null;
    }
  }
  return couponMemo;
}

function writeCoupon(code: string | null) {
  couponMemo = code;
  try {
    if (code) sessionStorage.setItem(COUPON_KEY, code);
    else sessionStorage.removeItem(COUPON_KEY);
  } catch {
    // storage unavailable: kept for this page only
  }
  couponListeners.forEach((l) => l());
}

/** The coupon the shopper applied, kept for the browser session (cleared once an order is placed). */
function useCouponCode() {
  const code = useSyncExternalStore(
    (onChange) => {
      couponListeners.add(onChange);
      return () => couponListeners.delete(onChange);
    },
    readCoupon,
    () => null,
  );
  return [code, writeCoupon] as const;
}

/** After an order is placed, the next checkout starts a fresh attempt. */
function forgetCheckoutAttempt() {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // storage unavailable
  }
}

type FieldErrors = Partial<Record<keyof CheckoutFields, string>>;
/** From /api/checkout/prefill (null for guests). */
type Prefill = { email: string; name: string | null; phone: string | null; addresses: Address[] };

function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs">
        {label}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[0.6875rem] text-taupe">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-[#9b2c1f]" data-error-for={name}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  "block min-h-12 w-full border border-obsidian/20 bg-ivory px-3.5 text-sm outline-none transition-colors placeholder:text-taupe/60 focus:border-obsidian aria-invalid:border-[#9b2c1f]";

/** `testMode`: the store runs on the local sample database, so orders are simulated (nothing stored, charged or shipped). */
export function CheckoutForm({ razorpayEnabled, testMode = false }: { razorpayEnabled: boolean; testMode?: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { lines, giftNote } = useCart();
  const { products } = useCatalog();
  const resolved = useMemo(() => resolveLines(lines, products), [lines, products]);
  const subtotal = resolved.reduce((s, l) => s + l.lineTotal, 0);

  const [chosen, setChosen] = useState<PaymentMethod | null>(null);
  // Test orders are priced like online payments (no COD fee).
  const method: PaymentMethod = testMode ? "razorpay" : (chosen ?? (razorpayEnabled ? "razorpay" : "cod"));
  const [recheck, setRecheck] = useState(0);
  const [couponCode, setCouponCode] = useCouponCode();
  const check = useCartCheck(lines, testMode ? undefined : method, recheck, testMode ? null : couponCode);
  // Once the live server check passes, show its prices; until then, the catalogue's.
  const totals = check && !check.blocking ? check.totals : computeTotals(subtotal, method);
  const needsReview = Boolean(check?.blocking);
  // The code only counts once the server has priced it in.
  const discount = couponCode && check?.discount ? check.discount : null;
  const appliedCode = discount?.ok && totals.discount > 0 ? discount.code : null;
  const codOk = codAvailable(computeTotals(subtotal, "cod", totals.discount).total);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [redirecting, setRedirecting] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const [account, setAccount] = useState<{ email: string; addresses: Address[] } | null>(null);

  const fill = (values: Partial<Record<string, string | null>>, onlyEmpty: boolean) => {
    const form = formRef.current;
    if (!form) return;
    for (const [name, value] of Object.entries(values)) {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (el && (!onlyEmpty || !el.value)) el.value = value ?? "";
    }
  };
  const addressValues = (a: Address) => ({
    name: a.name, phone: a.phone, address1: a.address1, address2: a.address2, city: a.city, state: a.state, pincode: a.pincode,
  });

  // Signed-in shoppers: prefill email and the default address (never overwriting typed input).
  useEffect(() => {
    let cancelled = false;
    // A Route Handler, not a Server Action, so it isn't queued behind the bag sync.
    fetch("/api/checkout/prefill", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Prefill | null>) : null))
      .then((p) => {
        if (cancelled || !p) return;
        setAccount({ email: p.email, addresses: p.addresses });
        const def = p.addresses.find((a) => a.isDefault) ?? p.addresses[0];
        requestAnimationFrame(() =>
          fill({ email: p.email, ...(def ? addressValues(def) : { name: p.name, phone: p.phone }) }, true),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = (orderId: string) => {
    setRedirecting(true);
    forgetCheckoutAttempt();
    writeCoupon(null);
    clearCart();
    router.push(`/orders/${orderId}`);
  };

  const onSubmit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const fields = Object.fromEntries(
      ["email", "phone", "name", "address1", "address2", "city", "state", "pincode"].map((k) => [k, String(data.get(k) ?? "")]),
    ) as CheckoutFields;

    setError(null);
    setFieldErrors({});
    const showErrors = (r: { error: string; fieldErrors?: FieldErrors }) => {
      setError(r.error);
      setFieldErrors(r.fieldErrors ?? {});
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true], [role=alert]")?.focus());
    };

    if (testMode) {
      startTransition(async () => {
        const result = await placeTestOrder({
          fields,
          giftNote,
          lines: lines.map(({ slug, colour, size, quantity }) => ({ slug, colour, size, quantity })),
        });
        if (!result.ok) return showErrors(result);
        try {
          sessionStorage.setItem(TEST_RECEIPT_KEY, JSON.stringify(result.receipt));
        } catch {
          // Storage blocked: the receipt page explains there's nothing to show.
        }
        setRedirecting(true);
        clearCart();
        router.push("/checkout/test-order");
      });
      return;
    }

    startTransition(async () => {
      const result = await placeOrder({
        fields,
        method,
        giftNote,
        lines: lines.map(({ slug, colour, size, quantity }) => ({ slug, colour, size, quantity })),
        checkoutToken: checkoutToken(lines, method),
        expectedTotal: totals.total,
        discountCode: appliedCode ?? undefined,
      });

      if (!result.ok) {
        // Refresh the summary so the shopper sees (and can accept) the new total.
        if (result.code === "PRICE_CHANGED" || result.code === "DISCOUNT_INVALID") setRecheck((n) => n + 1);
        return showErrors(result);
      }
      if (result.method === "cod") {
        finish(result.orderId);
        return;
      }

      if (!(await loadRazorpay()) || !window.Razorpay) {
        setError("We couldn't load the secure payment window. Check your connection and try again.");
        return;
      }
      const rzp = new window.Razorpay({
        key: result.razorpay.keyId,
        order_id: result.razorpay.orderId,
        amount: result.razorpay.amount,
        currency: result.razorpay.currency,
        name: "ACT VII",
        description: "Order payment",
        prefill: result.razorpay.prefill,
        theme: { color: "#0d0c0a" },
        handler: (response: RazorpayResponse) => {
          startTransition(async () => {
            await confirmRazorpayPayment({
              orderId: result.orderId,
              razorpayOrderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            // The order page shows the verified status (the webhook also confirms it).
            finish(result.orderId);
          });
        },
        modal: {
          ondismiss: () => setError("Payment was cancelled. Your bag is saved — you can try again."),
        },
      });
      rzp.on("payment.failed", (r) => setError(r.error?.description ?? "The payment didn't go through. Please try again."));
      rzp.open();
    });
  };

  if (redirecting) {
    return (
      <p className="py-24 text-center text-sm text-taupe" role="status">
        {testMode ? "Completing your test order…" : "Confirming your order…"}
      </p>
    );
  }

  // The bag is read from localStorage after hydration; don't flash "empty" first.
  if (!hydrated) {
    return <div aria-busy="true" aria-label="Loading checkout" className="h-96 animate-pulse bg-bone/60" />;
  }

  if (resolved.length === 0) {
    return (
      <div className="flex flex-col items-start gap-6 py-12">
        <p className="display text-4xl">Your bag is empty.</p>
        <ButtonLink href="/collections/all">Shop the collection</ButtonLink>
      </div>
    );
  }

  const busy = pending;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_24rem] lg:gap-16">
      <form
        ref={formRef}
        className="space-y-10"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onSubmit(e.currentTarget);
        }}
      >
        {testMode ? (
          <div role="note" className="border-2 border-dashed border-gold-deep/70 bg-gold/10 px-4 py-4 text-sm leading-relaxed">
            <p className="label text-gold-deep">Test checkout</p>
            <p className="mt-1.5 text-graphite">
              The store is running on sample data and ordering isn&apos;t live yet, so this checkout is a rehearsal. You can fill in every
              step, but{" "}
              <strong className="font-medium text-obsidian">no payment is taken, nothing is saved and nothing will be shipped.</strong>
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" tabIndex={-1} className="border border-[#9b2c1f]/40 bg-[#9b2c1f]/5 px-4 py-3 text-sm text-[#9b2c1f] outline-none">
            {error}
          </p>
        ) : null}

        <fieldset className="space-y-4">
          <legend className="display mb-4 text-2xl">Contact</legend>
          {testMode ? null : account ? (
            <p className="text-xs text-taupe">Signed in as {account.email}. This order will appear in your account.</p>
          ) : (
            <p className="text-xs text-taupe">
              Have an account?{" "}
              <Link href="/account" className="underline underline-offset-2">
                Sign in
              </Link>{" "}
              for saved addresses and order history.
            </p>
          )}
          <Field label="Email" name="email" error={fieldErrors.email} hint="For your order confirmation.">
            {(p) => <input {...p} name="email" type="email" required autoComplete="email" className={inputClass} />}
          </Field>
          <Field label="Mobile number" name="phone" error={fieldErrors.phone} hint="10-digit Indian mobile, for delivery updates.">
            {(p) => (
              <input {...p} name="phone" type="tel" required inputMode="tel" autoComplete="tel" pattern={PHONE_PATTERN} placeholder="98765 43210" className={inputClass} />
            )}
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="display mb-4 text-2xl">Delivery address</legend>
          {account && account.addresses.length > 1 ? (
            <SavedAddressPicker addresses={account.addresses} onPick={(a) => fill(addressValues(a), false)} />
          ) : null}
          <Field label="Full name" name="name" error={fieldErrors.name}>
            {(p) => <input {...p} name="name" required autoComplete="name" minLength={2} className={inputClass} />}
          </Field>
          <Field label="Flat, house no., building, street" name="address1" error={fieldErrors.address1}>
            {(p) => <input {...p} name="address1" required autoComplete="address-line1" minLength={5} className={inputClass} />}
          </Field>
          <Field label="Area, landmark (optional)" name="address2" error={fieldErrors.address2}>
            {(p) => <input {...p} name="address2" autoComplete="address-line2" className={inputClass} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field label="City" name="city" error={fieldErrors.city}>
              {(p) => <input {...p} name="city" required autoComplete="address-level2" className={inputClass} />}
            </Field>
            <Field label="PIN code" name="pincode" error={fieldErrors.pincode}>
              {(p) => (
                <input {...p} name="pincode" required inputMode="numeric" autoComplete="postal-code" pattern={PINCODE_PATTERN} maxLength={6} className={inputClass} />
              )}
            </Field>
          </div>
          <Field label="State" name="state" error={fieldErrors.state}>
            {(p) => (
              <select {...p} name="state" required autoComplete="address-level1" defaultValue="" className={`${inputClass} cursor-pointer`}>
                <option value="" disabled>
                  Select state
                </option>
                {indianStates.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </fieldset>

        <fieldset>
          <legend className="display mb-4 text-2xl">Payment</legend>
          {testMode ? (
            <label className="flex gap-4 border border-obsidian p-4">
              <input type="radio" name="payment" value="test" checked readOnly className="mt-1 size-4 accent-obsidian" />
              <span>
                <span className="block text-sm">Test payment</span>
                <span className="mt-0.5 block text-xs text-taupe">No money is taken. Online payment and cash on delivery open once the store goes live.</span>
              </span>
            </label>
          ) : (
          <div className="space-y-3">
            <PaymentOption
              value="razorpay"
              checked={method === "razorpay"}
              disabled={!razorpayEnabled}
              onSelect={setChosen}
              title="Pay online"
              detail={razorpayEnabled ? "UPI, cards, netbanking and wallets — secured by Razorpay." : "Online payment is not available yet."}
            />
            <PaymentOption
              value="cod"
              checked={method === "cod"}
              disabled={!codOk}
              onSelect={setChosen}
              title="Cash on delivery"
              detail={
                codOk
                  ? `Pay when your order arrives${policy.codFee ? ` (+${formatINR(policy.codFee)} fee)` : ""}.`
                  : `Available on orders up to ${formatINR(policy.codMaxOrderValue)}.`
              }
            />
          </div>
          )}
        </fieldset>

        <div className="space-y-4">
          <button
            type="submit"
            disabled={busy || needsReview || (!testMode && (method === "razorpay" ? !razorpayEnabled : !codOk))}
            className="label inline-flex min-h-13 w-full items-center justify-center gap-3 bg-obsidian px-6 py-4 text-ivory transition-colors hover:bg-graphite disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy
              ? "Processing…"
              : testMode
                ? `Place test order · ${formatINR(totals.total)}`
                : method === "cod"
                  ? `Place order · ${formatINR(totals.total)}`
                  : `Pay ${formatINR(totals.total)}`}
            {!busy ? <ArrowRightIcon className="size-3.5" /> : null}
          </button>
          {needsReview ? <ReviewBagNote /> : null}
          <p className="flex items-start gap-2 text-xs leading-relaxed text-taupe">
            <ShieldIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              Prices are confirmed on our server before you pay. By placing your order you agree to our{" "}
              <Link href="/help/terms" className="underline underline-offset-2">
                terms
              </Link>{" "}
              and{" "}
              <Link href="/help/returns" className="underline underline-offset-2">
                returns policy
              </Link>
              .
            </span>
          </p>
        </div>
      </form>

      <aside aria-labelledby="checkout-summary" className="order-first lg:order-none lg:sticky lg:top-32 lg:self-start">
        <div className="bg-bone/60 p-5 lg:p-6">
          <h2 id="checkout-summary" className="display text-2xl">
            Order summary
          </h2>
          <ul className="mt-4 divide-y divide-obsidian/10">
            {withLivePrices(resolved, check).map((line) => (
              <li key={line.id} className="flex gap-3 py-3">
                <div className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden bg-bone">
                  <Image src={line.product.images[0].src} alt="" fill sizes="56px" className="photo-grade object-cover" style={{ objectPosition: line.product.images[0].position }} />
                  <span className="absolute -top-0 right-0 grid min-w-5 place-items-center bg-obsidian px-1 text-[0.625rem] text-ivory">{line.quantity}</span>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate">{line.product.name}</p>
                  <p className="text-xs text-taupe">
                    {line.colour} / {line.size}
                  </p>
                  <LineIssue line={line} check={check} />
                </div>
                <p className="text-sm tabular-nums">{formatINR(line.lineTotal)}</p>
              </li>
            ))}
          </ul>
          {testMode ? null : (
            <CouponField
              key={couponCode ?? ""}
              code={couponCode}
              applied={discount?.ok ? discount : null}
              error={discount && !discount.ok ? discount.error : null}
              checking={Boolean(couponCode) && !discount}
              onApply={setCouponCode}
              onRemove={() => setCouponCode(null)}
            />
          )}
          <dl className="mt-4 space-y-2 border-t border-obsidian/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatINR(totals.subtotal)}</dd>
            </div>
            {totals.discount ? (
              <div className="flex justify-between">
                <dt>Discount{appliedCode ? ` (${appliedCode})` : ""}</dt>
                <dd className="tabular-nums">−{formatINR(totals.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd className="tabular-nums">{totals.shipping ? formatINR(totals.shipping) : "Complimentary"}</dd>
            </div>
            {totals.codFee ? (
              <div className="flex justify-between">
                <dt>COD fee</dt>
                <dd className="tabular-nums">{formatINR(totals.codFee)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-obsidian/10 pt-3 font-medium">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatINR(totals.total)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-taupe">Includes GST.</p>
          <Link href="/cart" className="mt-4 inline-block text-xs underline underline-offset-4">
            Edit bag
          </Link>
        </div>
      </aside>
    </div>
  );
}

/** Discount code entry in the order summary; once the server accepts a code, shows it with a Remove link. */
function CouponField({
  code,
  applied,
  error,
  checking,
  onApply,
  onRemove,
}: {
  code: string | null;
  applied: { code: string; description: string } | null;
  error: string | null;
  checking: boolean;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState(code ?? "");

  if (applied) {
    return (
      <div className="mt-4 flex items-start justify-between gap-3 border-t border-obsidian/10 pt-4 text-sm">
        <p>
          <span className="font-medium tracking-[0.08em]">{applied.code}</span> applied
          <span className="mt-0.5 block text-xs text-taupe">{applied.description}</span>
        </p>
        <button type="button" onClick={onRemove} className="text-xs underline underline-offset-4 hover:text-gold-deep">
          Remove
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-4 border-t border-obsidian/10 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const next = value.trim().toUpperCase();
        if (next) onApply(next);
      }}
    >
      <label htmlFor={id} className="mb-1.5 block text-xs">
        Discount code
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          className={`${inputClass} min-w-0 flex-1 uppercase`}
        />
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className="label min-h-12 shrink-0 border border-obsidian/60 px-5 hover:bg-obsidian hover:text-ivory disabled:opacity-45"
        >
          {checking ? "Checking…" : "Apply"}
        </button>
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-[#9b2c1f]">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function PaymentOption({
  value,
  checked,
  disabled,
  onSelect,
  title,
  detail,
}: {
  value: PaymentMethod;
  checked: boolean;
  disabled: boolean;
  onSelect: (m: PaymentMethod) => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex gap-4 border p-4 transition-colors ${
        disabled ? "cursor-not-allowed border-obsidian/10 opacity-55" : checked ? "cursor-pointer border-obsidian" : "cursor-pointer border-obsidian/20 hover:border-obsidian/50"
      }`}
    >
      <input
        type="radio"
        name="payment"
        value={value}
        checked={checked && !disabled}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="mt-1 size-4 accent-obsidian"
      />
      <span>
        <span className="block text-sm">{title}</span>
        <span className="mt-0.5 block text-xs text-taupe">{detail}</span>
      </span>
    </label>
  );
}

function SavedAddressPicker({ addresses, onPick }: { addresses: Address[]; onPick: (a: Address) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs">
        Saved addresses
      </label>
      <select
        id={id}
        defaultValue={addresses.find((a) => a.isDefault)?.id ?? ""}
        onChange={(e) => {
          const a = addresses.find((x) => x.id === e.target.value);
          if (a) onPick(a);
        }}
        className={`${inputClass} cursor-pointer`}
      >
        {addresses.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} — {a.address1}, {a.city} {a.pincode}
          </option>
        ))}
      </select>
    </div>
  );
}
