"use client";

import { useId, useState } from "react";
import { ArrowRightIcon } from "@/components/ui/Icons";

/**
 * Newsletter sign-up UI. No email provider is connected yet, so a valid
 * submission is acknowledged honestly and nothing is stored or sent.
 */
export function NewsletterForm() {
  const id = useId();
  const [status, setStatus] = useState<"idle" | "invalid" | "done">("idle");

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("email") as HTMLInputElement;
        setStatus(input.validity.valid && input.value ? "done" : "invalid");
      }}
    >
      <label htmlFor={id} className="sr-only">
        Email address
      </label>
      <div className="flex border border-ivory/25 focus-within:border-ivory/70">
        <input
          id={id}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Your email address"
          aria-invalid={status === "invalid"}
          aria-describedby={`${id}-status`}
          onChange={() => status !== "idle" && setStatus("idle")}
          className="min-h-12 w-full bg-transparent px-4 text-sm text-ivory outline-none placeholder:text-taupe-light"
        />
        <button type="submit" aria-label="Subscribe" className="grid w-12 shrink-0 place-items-center bg-gold text-obsidian transition-colors hover:bg-sand">
          <ArrowRightIcon className="size-4" />
        </button>
      </div>
      <p id={`${id}-status`} role="status" className="mt-2 min-h-5 text-xs text-taupe-light">
        {status === "invalid" && "Please enter a valid email address."}
        {status === "done" && "Thank you. Sign-ups open soon — this demo did not store your email."}
      </p>
    </form>
  );
}
