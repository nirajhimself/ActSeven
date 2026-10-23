import "server-only";
import { formatINR } from "@/lib/format";
import { siteUrl as publicSiteUrl } from "@/lib/site";
import { claimEmail, getOrder, releaseEmail, type Order } from "./orders";

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function siteUrl() {
  return publicSiteUrl;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function layout(title: string, intro: string, order: Order, extra = "") {
  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e4dccd">${esc(i.productName)}<br><span style="color:#6e655a;font-size:12px">${esc(i.colour)} / ${esc(i.size)} · Qty ${i.quantity}</span></td>
        <td style="padding:10px 0;border-bottom:1px solid #e4dccd;text-align:right">${formatINR(i.unitPrice * i.quantity)}</td>
      </tr>`,
    )
    .join("");
  const link = `${siteUrl()}/orders/${order.id}`;
  return `<!doctype html><html><body style="margin:0;background:#f5f0e7;font-family:Helvetica,Arial,sans-serif;color:#0d0c0a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e7;padding:32px 16px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;padding:36px 32px">
    <tr><td style="text-align:center;font-family:Georgia,serif;letter-spacing:6px;font-size:20px;padding-bottom:28px">ACT VII</td></tr>
    <tr><td style="font-family:Georgia,serif;font-size:26px;line-height:1.25;padding-bottom:12px">${esc(title)}</td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#2a2622;padding-bottom:8px">${intro}</td></tr>
    <tr><td style="font-size:12px;letter-spacing:1.5px;color:#6e655a;padding:8px 0 20px">ORDER ${esc(order.number)}</td></tr>
    ${extra}
    <tr><td><table role="presentation" width="100%" style="font-size:14px">${rows}
      <tr><td style="padding:8px 0 0">Shipping</td><td style="padding:8px 0 0;text-align:right">${order.shipping ? formatINR(order.shipping) : "Complimentary"}</td></tr>
      ${order.codFee ? `<tr><td>COD fee</td><td style="text-align:right">${formatINR(order.codFee)}</td></tr>` : ""}
      <tr><td style="padding-top:8px;font-weight:bold">Total</td><td style="padding-top:8px;text-align:right;font-weight:bold">${formatINR(order.total)}</td></tr>
    </table></td></tr>
    <tr><td style="font-size:13px;line-height:1.6;color:#2a2622;padding-top:24px">Delivering to:<br>${esc(order.name)}<br>${esc(order.address1)}${order.address2 ? `<br>${esc(order.address2)}` : ""}<br>${esc(order.city)}, ${esc(order.state)} ${esc(order.pincode)}</td></tr>
    <tr><td style="padding-top:28px"><a href="${link}" style="display:inline-block;background:#0d0c0a;color:#f5f0e7;text-decoration:none;font-size:12px;letter-spacing:2px;padding:14px 22px">VIEW YOUR ORDER</a></td></tr>
  </table></td></tr></table></body></html>`;
}

async function send(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

async function sendOnce(orderId: string, kind: "confirmation" | "shipping", build: (o: Order) => { subject: string; html: string } | null) {
  if (!isEmailConfigured()) return;
  if (!(await claimEmail(orderId, kind))) return; // already sent (or being sent)
  try {
    const order = await getOrder(orderId);
    const message = order && build(order);
    if (!order || !message) {
      await releaseEmail(orderId, kind);
      return;
    }
    await send(order.email, message.subject, message.html);
  } catch (err) {
    console.error(`[email] ${kind} email failed for ${orderId}`, err);
    await releaseEmail(orderId, kind).catch(() => {});
  }
}

/** Sent once an order is confirmed: COD placed, or online payment verified. */
export function sendOrderConfirmation(orderId: string) {
  return sendOnce(orderId, "confirmation", (o) => {
    if (o.status !== "paid" && o.status !== "cod_confirmed") return null;
    const intro =
      o.status === "paid"
        ? `Thank you, ${esc(o.name.split(" ")[0])}. We've received your payment of ${formatINR(o.total)} and are preparing your order.`
        : `Thank you, ${esc(o.name.split(" ")[0])}. Your cash-on-delivery order is placed — please keep ${formatINR(o.total)} ready when it arrives.`;
    return { subject: `Your ACT VII order ${o.number}`, html: layout("Your order is confirmed.", intro, o) };
  });
}

export function sendShippingNotice(orderId: string) {
  return sendOnce(orderId, "shipping", (o) => {
    if (o.status !== "shipped") return null;
    const tracking = o.trackingNumber
      ? `<tr><td style="font-size:14px;padding-bottom:20px">Tracking: <strong>${esc(o.trackingNumber)}</strong>${o.carrier ? ` (${esc(o.carrier)})` : ""}</td></tr>`
      : "";
    return {
      subject: `Your ACT VII order ${o.number} has shipped`,
      html: layout("Your order is on its way.", `Good news, ${esc(o.name.split(" ")[0])} — your order has left our studio.`, o, tracking),
    };
  });
}

/** Sign-in code email. Throws if sending fails so the caller can report it. */
export async function sendLoginCode(email: string, code: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#f5f0e7;font-family:Helvetica,Arial,sans-serif;color:#0d0c0a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:480px;background:#fffdf8;padding:36px 32px">
    <tr><td style="text-align:center;font-family:Georgia,serif;letter-spacing:6px;font-size:20px;padding-bottom:28px">ACT VII</td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#2a2622">Your sign-in code is:</td></tr>
    <tr><td style="font-family:Georgia,serif;font-size:36px;letter-spacing:10px;padding:16px 0">${esc(code)}</td></tr>
    <tr><td style="font-size:13px;line-height:1.6;color:#6e655a">It expires in 10 minutes. If you didn't request it, you can ignore this email.</td></tr>
  </table></td></tr></table></body></html>`;
  await send(email, `${code} is your ACT VII sign-in code`, html);
}

function notice(title: string, paragraphs: string[], order: Order) {
  const body = paragraphs.map((p) => `<tr><td style="font-size:14px;line-height:1.6;color:#2a2622;padding-bottom:12px">${p}</td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f5f0e7;font-family:Helvetica,Arial,sans-serif;color:#0d0c0a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#fffdf8;padding:36px 32px">
    <tr><td style="text-align:center;font-family:Georgia,serif;letter-spacing:6px;font-size:20px;padding-bottom:28px">ACT VII</td></tr>
    <tr><td style="font-family:Georgia,serif;font-size:26px;line-height:1.25;padding-bottom:12px">${esc(title)}</td></tr>
    ${body}
    <tr><td style="font-size:12px;letter-spacing:1.5px;color:#6e655a;padding:8px 0 20px">ORDER ${esc(order.number)}</td></tr>
    <tr><td><a href="${siteUrl()}/orders/${order.id}" style="display:inline-block;background:#0d0c0a;color:#f5f0e7;text-decoration:none;font-size:12px;letter-spacing:2px;padding:14px 22px">VIEW YOUR ORDER</a></td></tr>
  </table></td></tr></table></body></html>`;
}

/**
 * Return and refund updates. Each is triggered by a guarded status change,
 * so it fires once per transition. Failures are logged, never thrown.
 */
export async function sendReturnUpdate(
  orderId: string,
  kind: "requested" | "approved" | "rejected" | "refunded" | "cancel-refund",
  details: { amount: number; note?: string | null; method?: "razorpay" | "manual" },
) {
  if (!isEmailConfigured()) return;
  try {
    const order = await getOrder(orderId);
    if (!order) return;
    const first = esc(order.name.split(" ")[0]);
    const note = details.note ? `Note from our team: “${esc(details.note)}”` : null;
    const refundWhere =
      details.method === "manual"
        ? "We've sent it by bank transfer / UPI."
        : "It's on its way to your original payment method and usually appears within 5–7 working days.";
    const content = {
      requested: {
        subject: `We've received your return request · ${order.number}`,
        title: "Return requested.",
        body: [`Thank you, ${first}. We've received your request to return items worth ${formatINR(details.amount)}. We'll review it and email you the next steps, usually within two working days.`],
      },
      approved: {
        subject: `Your return is approved · ${order.number}`,
        title: "Your return is approved.",
        body: [
          `Good news, ${first} — your return is approved. Please pack the items unworn, with their original tags, and keep them ready. Our team will be in touch to arrange the pickup.`,
          ...(note ? [note] : []),
        ],
      },
      rejected: {
        subject: `About your return request · ${order.number}`,
        title: "We couldn't accept this return.",
        body: [`Sorry, ${first} — we weren't able to accept this return request.`, ...(note ? [note] : []), "Reply to this email if you'd like to talk it through."],
      },
      refunded: {
        subject: `Your refund of ${formatINR(details.amount)} · ${order.number}`,
        title: "Your refund is on its way.",
        body: [`We've received your returned items and refunded ${formatINR(details.amount)}. ${refundWhere}`],
      },
      "cancel-refund": {
        subject: `Your order ${order.number} was cancelled`,
        title: "Your order was cancelled.",
        body: [`Your order has been cancelled and ${formatINR(details.amount)} has been refunded. ${refundWhere}`],
      },
    }[kind];
    await send(order.email, content.subject, notice(content.title, content.body, order));
  } catch (err) {
    console.error(`[email] return ${kind} email failed for ${orderId}`, err);
  }
}
