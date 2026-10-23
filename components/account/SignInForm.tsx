"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { requestLoginCodeAction, verifyLoginCodeAction } from "@/app/account/actions";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { announceAccountChange } from "@/lib/cart";

const input =
  "block min-h-12 w-full border border-obsidian/20 bg-ivory px-3.5 text-sm outline-none focus:border-obsidian aria-invalid:border-[#9b2c1f]";
const RESEND_SECONDS = 30;

export function SignInForm() {
  const id = useId();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = () =>
    startTransition(async () => {
      setError(null);
      const res = await requestLoginCodeAction(email);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDevCode(res.devCode ?? null);
      setStep("code");
      setCode("");
      setCooldown(RESEND_SECONDS);
      requestAnimationFrame(() => codeRef.current?.focus());
    });

  const verify = () =>
    startTransition(async () => {
      setError(null);
      const res = await verifyLoginCodeAction(email, code);
      if (!res.ok) setError(res.error);
      // On success the action refreshes the page into the signed-in view;
      // tell the bag to merge with the account's saved bag.
      else announceAccountChange(true);
    });

  return (
    <div className="max-w-md">
      <h2 className="display text-3xl">Sign in</h2>
      <p className="mt-3 text-sm text-taupe">
        {step === "email"
          ? "Enter your email and we'll send you a 6-digit code. No password needed — new here? This creates your account."
          : `We sent a code to ${email}.`}
      </p>

      {step === "email" ? (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
        >
          <div>
            <label htmlFor={`${id}-email`} className="mb-1.5 block text-xs">
              Email
            </label>
            <input
              id={`${id}-email`}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-err` : undefined}
              className={input}
            />
          </div>
          <SubmitButton pending={pending}>Email me a code</SubmitButton>
        </form>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          {devCode ? (
            <p className="border border-dashed border-gold-deep/60 px-3 py-2 text-xs text-gold-deep">
              Development mode (no email provider): your code is <strong className="tracking-[0.2em]">{devCode}</strong>
            </p>
          ) : null}
          <div>
            <label htmlFor={`${id}-code`} className="mb-1.5 block text-xs">
              6-digit code
            </label>
            <input
              ref={codeRef}
              id={`${id}-code`}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-err` : undefined}
              className={`${input} text-center text-lg tracking-[0.5em]`}
            />
          </div>
          <SubmitButton pending={pending}>Sign in</SubmitButton>
          <div className="flex justify-between text-xs">
            <button type="button" onClick={() => setStep("email")} className="underline underline-offset-4">
              Use a different email
            </button>
            <button type="button" onClick={sendCode} disabled={cooldown > 0 || pending} className="underline underline-offset-4 disabled:no-underline disabled:opacity-50">
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      <p id={`${id}-err`} role="alert" className="mt-3 min-h-5 text-xs text-[#9b2c1f]">
        {error ?? ""}
      </p>
    </div>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="label inline-flex min-h-12 w-full items-center justify-center gap-3 bg-obsidian px-6 text-ivory transition-colors hover:bg-graphite disabled:opacity-50"
    >
      {pending ? "Please wait…" : children}
      {!pending ? <ArrowRightIcon className="size-3.5" /> : null}
    </button>
  );
}
