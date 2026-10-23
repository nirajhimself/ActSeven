"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/db";
import { sendReturnUpdate } from "@/lib/server/email";
import { createReturn, getReturn } from "@/lib/server/returns";

/**
 * Requests a return. Like the order page itself, access is by the order's
 * unguessable id (sent only to the customer); the server re-checks the
 * delivery date, return window and remaining quantities.
 */
export async function requestReturnAction(
  orderId: string,
  input: { items: { orderItemId: string; quantity: number }[]; reason: string; comment: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDatabaseConfigured()) return { ok: false, error: "Returns aren't available right now." };
  const items = Array.isArray(input?.items)
    ? input.items.slice(0, 50).map((i) => ({ orderItemId: String(i?.orderItemId ?? ""), quantity: Math.floor(Number(i?.quantity)) }))
    : [];
  try {
    const res = await createReturn(String(orderId), {
      items: items.filter((i) => /^\d+$/.test(i.orderItemId)),
      reason: String(input?.reason ?? ""),
      comment: String(input?.comment ?? ""),
    });
    if (!res.ok) return res;
    after(async () => {
      const ret = await getReturn(res.id);
      if (ret) await sendReturnUpdate(ret.orderId, "requested", { amount: ret.amount });
    });
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("[returns] request failed", err);
    return { ok: false, error: "We couldn't submit your return just now. Please try again." };
  }
}
