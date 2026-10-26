"use client";

import { useActionState, useId } from "react";
import { adminSignInAction, type SignInState } from "@/app/admin/session-actions";
import { ArrowRightIcon } from "@/components/ui/Icons";

const input =
  "block min-h-12 w-full border border-obsidian/20 bg-ivory px-3.5 text-sm outline-none focus:border-obsidian aria-invalid:border-[#9b2c1f]";

export function AdminSignInForm({ next }: { next: string }) {
  const id = useId();
  const [state, formAction, pending] = useActionState<SignInState, FormData>(adminSignInAction, { error: null });
  return (
    <form action={formAction} className="mt-8 space-y-4" aria-describedby={state.error ? `${id}-error` : undefined}>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor={`${id}-user`} className="mb-1.5 block text-xs">
          Username
        </label>
        <input id={`${id}-user`} name="username" required autoComplete="username" className={input} aria-invalid={Boolean(state.error)} suppressHydrationWarning />
      </div>
      <div>
        <label htmlFor={`${id}-pass`} className="mb-1.5 block text-xs">
          Password
        </label>
        <input id={`${id}-pass`} name="password" type="password" required autoComplete="current-password" className={input} aria-invalid={Boolean(state.error)} suppressHydrationWarning />
      </div>
      <p id={`${id}-error`} role="alert" className="min-h-4 text-xs text-[#9b2c1f]">
        {state.error ?? ""}
      </p>
      <button
        type="submit"
        disabled={pending}
        suppressHydrationWarning
        className="label inline-flex min-h-12 w-full items-center justify-center gap-3 bg-obsidian px-6 text-ivory transition-colors hover:bg-graphite disabled:opacity-45"
      >
        {pending ? "Signing in…" : "Sign in"}
        {!pending ? <ArrowRightIcon className="size-3.5" /> : null}
      </button>
    </form>
  );
}
