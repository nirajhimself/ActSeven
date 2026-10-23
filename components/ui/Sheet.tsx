"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** right/left: full-height side sheet. center: modal panel. */
  side?: "right" | "left" | "center";
  labelledBy: string;
  className?: string;
  children: ReactNode;
};

/**
 * Wrapper around the native modal <dialog>, which provides focus trapping,
 * Escape-to-close, an inert background and focus restoration for free.
 */
export function Sheet({ open, onClose, side = "right", labelledBy, className = "", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const sideClass = side === "center" ? "modal" : `sheet sheet-${side}`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={`${sideClass} bg-ivory text-obsidian backdrop:bg-obsidian/55 ${className}`}
      onClose={onClose}
      onClick={(e) => {
        // A click whose target is the <dialog> itself landed on the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
