"use client";

import { useId, useState, useTransition } from "react";
import { requestReturnAction } from "@/app/orders/[id]/actions";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import { RETURN_REASONS } from "@/lib/returns";

type Item = { id: string; productName: string; colour: string; size: string; unitPrice: number; returnable: number };

const inputClass =
  "block min-h-12 w-full border border-obsidian/20 bg-ivory px-3.5 text-sm outline-none transition-colors focus:border-obsidian";

export function ReturnRequestForm({ orderId, items, deadline }: { orderId: string; items: Item[]; deadline: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const chosen = items.filter((i) => (qty[i.id] ?? 0) > 0);
  const amount = chosen.reduce((sum, i) => sum + i.unitPrice * qty[i.id], 0);

  if (done) {
    return (
      <p role="status" className="border border-obsidian/15 bg-bone/60 px-4 py-3 text-sm">
        Thank you — your return request is in. We&apos;ll email you the next steps.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Request a return
        </Button>
        <p className="text-xs text-taupe">Returns can be requested until {deadline}.</p>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chosen.length === 0) return setError("Choose at least one item to return.");
    if (!reason) return setError("Please choose a reason for the return.");
    setError(null);
    startTransition(async () => {
      const res = await requestReturnAction(orderId, {
        items: chosen.map((i) => ({ orderItemId: i.id, quantity: qty[i.id] })),
        reason,
        comment,
      });
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6 border border-obsidian/15 p-5 sm:p-6" aria-describedby={`${id}-error`}>
      <fieldset>
        <legend className="label">Items to return</legend>
        <ul className="mt-3 divide-y divide-obsidian/10">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                {i.productName}
                <span className="block text-xs text-taupe">
                  {i.colour} / {i.size} · {formatINR(i.unitPrice)} each
                </span>
              </div>
              {i.returnable > 0 ? (
                <label className="flex items-center gap-2 text-xs">
                  Quantity
                  <select
                    value={qty[i.id] ?? 0}
                    onChange={(e) => setQty((q) => ({ ...q, [i.id]: Number(e.target.value) }))}
                    className="min-h-11 cursor-pointer border border-obsidian/20 bg-ivory px-2 text-sm"
                  >
                    {Array.from({ length: i.returnable + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="text-xs text-taupe">Already in a return</span>
              )}
            </li>
          ))}
        </ul>
      </fieldset>

      <label className="block text-xs">
        Reason
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} mt-1.5 cursor-pointer`}>
          <option value="" disabled>
            Choose a reason
          </option>
          {RETURN_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>

      <label className="block text-xs">
        Anything we should know? <span className="text-taupe">(optional)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          rows={3}
          className={`${inputClass} mt-1.5 py-3`}
        />
      </label>

      <p className="text-xs leading-relaxed text-taupe">
        Items must be unworn, with original tags. Shipping charges aren&apos;t refunded. Refunds go to your original payment method; for
        cash-on-delivery orders we&apos;ll arrange a bank or UPI transfer.
      </p>

      <p id={`${id}-error`} role="alert" className="min-h-4 text-xs text-[#9b2c1f]">
        {error ?? ""}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending} arrow>
          {pending ? "Submitting…" : amount ? `Request return · ${formatINR(amount)}` : "Request return"}
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs underline underline-offset-4">
          Cancel
        </button>
      </div>
    </form>
  );
}
