"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { CATALOG_TAG } from "@/lib/server/catalog";
import { sendReturnUpdate, sendShippingNotice } from "@/lib/server/email";
import { setStockLevels, stockChangesFrom } from "@/lib/server/inventory";
import { cancelOrder, getOrder, markDelivered, markShipped } from "@/lib/server/orders";
import { approveReturn, getReturn, receiveReturn, refundCancelledOrder, refundReturn, rejectReturn } from "@/lib/server/returns";

const UUID = /^[0-9a-f-]{36}$/i;

function orderIdFrom(formData: FormData) {
  const id = String(formData.get("orderId") ?? "");
  if (!UUID.test(id)) redirect("/admin/orders");
  return id;
}

/** Back to the order page with a status message (and an error detail, e.g. from Razorpay). */
function back(id: string, msg: string, error?: string): never {
  const query = new URLSearchParams({ msg });
  if (error) query.set("error", error);
  redirect(`/admin/orders/${id}?${query}`);
}

function returnIdFrom(formData: FormData) {
  const id = String(formData.get("returnId") ?? "");
  return UUID.test(id) ? id : null;
}

const note = (formData: FormData) => String(formData.get("note") ?? "").trim().slice(0, 500);

export async function shipOrderAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = orderIdFrom(formData);
  const ok = await markShipped(id, {
    number: String(formData.get("tracking") ?? "").trim().slice(0, 80),
    carrier: String(formData.get("carrier") ?? "").trim().slice(0, 60),
  });
  if (ok) {
    await admin.audit("order.ship", "order", id, { carrier: String(formData.get("carrier") ?? ""), tracking: String(formData.get("tracking") ?? "") });
    after(() => sendShippingNotice(id));
  }
  back(id, ok ? "shipped" : "invalid");
}

export async function deliverOrderAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = orderIdFrom(formData);
  const ok = await markDelivered(id);
  if (ok) await admin.audit("order.deliver", "order", id);
  back(id, ok ? "delivered" : "invalid");
}

/**
 * Saves the inventory grid. Fields are `stock:<variantId>` with the value shown
 * when the page loaded in `orig:<variantId>`; only edited rows are written, so
 * stock taken by orders after the page loaded isn't overwritten.
 */
export async function saveInventoryAction(formData: FormData) {
  const admin = await requireAdmin();
  const { levels } = stockChangesFrom(formData);
  const saved = await setStockLevels(levels);
  if (saved > 0) {
    updateTag(CATALOG_TAG);
    await admin.audit("inventory.update", "inventory", null, { changes: levels.slice(0, 200) });
  }
  redirect(`/admin/inventory?saved=${saved}`);
}

/** Cancels an order; if it was paid online, the full amount is refunded through Razorpay. */
export async function cancelOrderAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = orderIdFrom(formData);
  if (!(await cancelOrder(id))) back(id, "invalid");
  await admin.audit("order.cancel", "order", id);
  updateTag(CATALOG_TAG); // its stock is back on sale
  const refund = await refundCancelledOrder(id);
  if (!refund) back(id, "cancelled");
  else if (!refund.ok) back(id, "refund-failed", refund.error);
  else {
    after(async () => {
      const total = await getOrderTotal(id);
      if (total) await sendReturnUpdate(id, "cancel-refund", { amount: total, method: refund.method });
    });
    back(id, "cancelled-refunded");
  }
}

/** Retries the refund for a cancelled online order (after a failed attempt). */
export async function retryCancelRefundAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = orderIdFrom(formData);
  const refund = await refundCancelledOrder(id);
  if (refund) await admin.audit("order.refund_retry", "order", id, { ok: refund.ok });
  if (!refund) back(id, "invalid");
  else if (!refund.ok) back(id, "refund-failed", refund.error);
  else {
    after(async () => {
      const total = await getOrderTotal(id);
      if (total) await sendReturnUpdate(id, "cancel-refund", { amount: total, method: refund.method });
    });
    back(id, "refunded");
  }
}

async function getOrderTotal(id: string) {
  return (await getOrder(id))?.total ?? null;
}

export async function approveReturnAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = orderIdFrom(formData);
  const returnId = returnIdFrom(formData);
  const text = note(formData);
  if (!returnId || !(await approveReturn(returnId, text))) back(id, "invalid");
  await admin.audit("return.approve", "return", returnId, { orderId: id });
  after(async () => {
    const ret = await getReturn(returnId);
    if (ret) await sendReturnUpdate(id, "approved", { amount: ret.amount, note: text });
  });
  back(id, "return-approved");
}

export async function rejectReturnAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = orderIdFrom(formData);
  const returnId = returnIdFrom(formData);
  const text = note(formData);
  if (!returnId || !(await rejectReturn(returnId, text))) back(id, "invalid");
  await admin.audit("return.reject", "return", returnId, { orderId: id });
  after(async () => {
    const ret = await getReturn(returnId);
    if (ret) await sendReturnUpdate(id, "rejected", { amount: ret.amount, note: text });
  });
  back(id, "return-rejected");
}

export async function receiveReturnAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = orderIdFrom(formData);
  const returnId = returnIdFrom(formData);
  const restock = formData.get("restock") === "on";
  if (!returnId || !(await receiveReturn(returnId, restock))) back(id, "invalid");
  await admin.audit("return.receive", "return", returnId, { orderId: id, restock });
  if (restock) updateTag(CATALOG_TAG);
  back(id, restock ? "return-received-restocked" : "return-received");
}

export async function refundReturnAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = orderIdFrom(formData);
  const returnId = returnIdFrom(formData);
  if (!returnId) back(id, "invalid");
  const res = await refundReturn(id, returnId, String(formData.get("reference") ?? ""));
  await admin.audit("return.refund", "return", returnId, { orderId: id, ok: res.ok });
  if (!res.ok) back(id, "refund-failed", res.error);
  else {
    after(async () => {
      const ret = await getReturn(returnId);
      if (ret) await sendReturnUpdate(id, "refunded", { amount: ret.amount, method: res.method });
    });
    back(id, "refunded");
  }
}
