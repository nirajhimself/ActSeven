import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowRightIcon } from "./Icons";

type Variant = "solid" | "light" | "outline" | "outline-light" | "gold";

const base =
  "label inline-flex min-h-11 items-center justify-center gap-3 px-6 py-3 transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-45";

const variants: Record<Variant, string> = {
  solid: "bg-obsidian text-ivory hover:bg-graphite",
  light: "bg-ivory text-obsidian hover:bg-bone",
  outline: "border border-obsidian/70 text-obsidian hover:bg-obsidian hover:text-ivory",
  "outline-light": "border border-ivory/70 text-ivory hover:bg-ivory hover:text-obsidian",
  gold: "bg-gold text-obsidian hover:bg-sand",
};

export function buttonClass(variant: Variant = "solid", extra = "") {
  return `${base} ${variants[variant]} ${extra}`;
}

type CommonProps = { variant?: Variant; arrow?: boolean; children: ReactNode; className?: string };

export function ButtonLink({
  variant = "solid",
  arrow = true,
  className = "",
  children,
  ...props
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(variant, className)} {...props}>
      {children}
      {arrow ? <ArrowRightIcon className="size-3.5" /> : null}
    </Link>
  );
}

export function Button({
  variant = "solid",
  arrow = false,
  className = "",
  children,
  ...props
}: CommonProps & ComponentProps<"button">) {
  return (
    <button className={buttonClass(variant, className)} {...props}>
      {children}
      {arrow ? <ArrowRightIcon className="size-3.5" /> : null}
    </button>
  );
}
