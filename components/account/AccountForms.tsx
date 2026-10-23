"use client";

import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import {
  deleteAddressAction,
  saveAddressAction,
  setDefaultAddressAction,
  signOutAction,
  syncWishlistAction,
  updateProfileAction,
} from "@/app/account/actions";
import type { AddressFields } from "@/lib/address-validation";
import { indianStates, PHONE_PATTERN, PINCODE_PATTERN } from "@/lib/india";
import type { Address } from "@/lib/server/customers";
import { getWishlistSnapshot, replaceWishlist } from "@/lib/wishlist";

const input =
  "block min-h-11 w-full border border-obsidian/20 bg-ivory px-3 text-sm outline-none focus:border-obsidian aria-invalid:border-[#9b2c1f]";
const primaryBtn = "label inline-flex min-h-11 items-center justify-center bg-obsidian px-5 text-ivory hover:bg-graphite disabled:opacity-50";
const textBtn = "min-h-9 text-xs underline underline-offset-4 disabled:opacity-50";

/** Merges this device's wishlist into the account once, then adopts the merged list. */
export function WishlistSync() {
  useEffect(() => {
    let cancelled = false;
    syncWishlistAction(getWishlistSnapshot())
      .then((merged) => {
        if (!cancelled && merged) replaceWishlist(merged);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => startTransition(() => signOutAction())} className="label min-h-11 border border-obsidian/40 px-5 hover:bg-obsidian hover:text-ivory disabled:opacity-50">
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

function Labelled({ label, error, children }: { label: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs">
        {label}
      </label>
      {children(id)}
      {error ? <p className="mt-1 text-xs text-[#9b2c1f]">{error}</p> : null}
    </div>
  );
}

export function ProfileForm({ email, name, phone }: { email: string; name: string | null; phone: string | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="grid max-w-xl gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await updateProfileAction({ name: String(data.get("name") ?? ""), phone: String(data.get("phone") ?? "") });
          setMessage(res.ok ? { ok: true, text: "Profile saved." } : { ok: false, text: res.error ?? "Couldn't save." });
        });
      }}
    >
      <Labelled label="Full name">{(id) => <input id={id} name="name" defaultValue={name ?? ""} autoComplete="name" className={input} />}</Labelled>
      <Labelled label="Mobile number">
        {(id) => <input id={id} name="phone" type="tel" defaultValue={phone ?? ""} autoComplete="tel" pattern={PHONE_PATTERN} className={input} />}
      </Labelled>
      <div className="sm:col-span-2">
        <p className="text-xs text-taupe">Email: {email}</p>
      </div>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? "Saving…" : "Save profile"}
        </button>
        <p role="status" className={`text-xs ${message?.ok === false ? "text-[#9b2c1f]" : "text-taupe"}`}>
          {message?.text ?? ""}
        </p>
      </div>
    </form>
  );
}

function AddressForm({ initial, onDone }: { initial?: Address; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof AddressFields, string>>>({});
  const v = (k: keyof AddressFields) => (initial ? (initial[k] ?? "") : "");

  return (
    <form
      className="grid gap-4 border border-obsidian/15 p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const fields = Object.fromEntries(
          ["name", "phone", "address1", "address2", "city", "state", "pincode"].map((k) => [k, String(data.get(k) ?? "")]),
        ) as AddressFields;
        startTransition(async () => {
          const res = await saveAddressAction({ ...fields, id: initial?.id, makeDefault: data.get("makeDefault") === "on" });
          if (res.ok) onDone();
          else {
            setError(res.error);
            setFieldErrors(res.fieldErrors ?? {});
          }
        });
      }}
    >
      <Labelled label="Full name" error={fieldErrors.name}>
        {(id) => <input id={id} name="name" required defaultValue={v("name")} autoComplete="name" className={input} aria-invalid={Boolean(fieldErrors.name)} />}
      </Labelled>
      <Labelled label="Mobile number" error={fieldErrors.phone}>
        {(id) => <input id={id} name="phone" type="tel" required defaultValue={v("phone")} pattern={PHONE_PATTERN} autoComplete="tel" className={input} aria-invalid={Boolean(fieldErrors.phone)} />}
      </Labelled>
      <div className="sm:col-span-2">
        <Labelled label="Flat, house no., building, street" error={fieldErrors.address1}>
          {(id) => <input id={id} name="address1" required defaultValue={v("address1")} autoComplete="address-line1" className={input} aria-invalid={Boolean(fieldErrors.address1)} />}
        </Labelled>
      </div>
      <div className="sm:col-span-2">
        <Labelled label="Area, landmark (optional)">
          {(id) => <input id={id} name="address2" defaultValue={v("address2")} autoComplete="address-line2" className={input} />}
        </Labelled>
      </div>
      <Labelled label="City" error={fieldErrors.city}>
        {(id) => <input id={id} name="city" required defaultValue={v("city")} autoComplete="address-level2" className={input} aria-invalid={Boolean(fieldErrors.city)} />}
      </Labelled>
      <Labelled label="PIN code" error={fieldErrors.pincode}>
        {(id) => (
          <input id={id} name="pincode" required inputMode="numeric" maxLength={6} pattern={PINCODE_PATTERN} defaultValue={v("pincode")} autoComplete="postal-code" className={input} aria-invalid={Boolean(fieldErrors.pincode)} />
        )}
      </Labelled>
      <div className="sm:col-span-2">
        <Labelled label="State" error={fieldErrors.state}>
          {(id) => (
            <select id={id} name="state" required defaultValue={v("state")} autoComplete="address-level1" className={input} aria-invalid={Boolean(fieldErrors.state)}>
              <option value="" disabled>
                Select state
              </option>
              {indianStates.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
        </Labelled>
      </div>
      {!initial?.isDefault ? (
        <label className="flex items-center gap-2 text-xs sm:col-span-2">
          <input type="checkbox" name="makeDefault" className="size-4 accent-obsidian" /> Make this my default address
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-[#9b2c1f] sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="flex gap-4 sm:col-span-2">
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? "Saving…" : "Save address"}
        </button>
        <button type="button" onClick={onDone} className={textBtn}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AddressBook({ addresses }: { addresses: Address[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {addresses.length === 0 && editing !== "new" ? (
        <p className="text-sm text-taupe">No saved addresses yet. Addresses you use at checkout are saved here automatically.</p>
      ) : null}
      <ul className="grid gap-4 md:grid-cols-2">
        {addresses.map((a) =>
          editing === a.id ? (
            <li key={a.id} className="md:col-span-2">
              <AddressForm initial={a} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.id} className="flex flex-col border border-obsidian/15 p-5 text-sm">
              {a.isDefault ? <span className="label mb-2 self-start bg-bone px-2 py-1 text-[0.5625rem]">Default</span> : null}
              <address className="leading-relaxed not-italic">
                {a.name}
                <br />
                {a.address1}
                {a.address2 ? (
                  <>
                    <br />
                    {a.address2}
                  </>
                ) : null}
                <br />
                {a.city}, {a.state} {a.pincode}
                <br />
                <span className="text-taupe">{a.phone}</span>
              </address>
              <div className="mt-4 flex flex-wrap gap-4">
                <button type="button" onClick={() => setEditing(a.id)} className={textBtn}>
                  Edit
                </button>
                {!a.isDefault ? (
                  <button type="button" disabled={pending} onClick={() => startTransition(() => setDefaultAddressAction(a.id))} className={textBtn}>
                    Make default
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(() => deleteAddressAction(a.id))}
                  className={`${textBtn} text-[#8a2a1c]`}
                  aria-label={`Delete address ${a.address1}`}
                >
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <AddressForm onDone={() => setEditing(null)} />
      ) : addresses.length < 10 ? (
        <button type="button" onClick={() => setEditing("new")} className="label min-h-11 border border-obsidian/40 px-5 hover:bg-obsidian hover:text-ivory">
          Add address
        </button>
      ) : null}
    </div>
  );
}
