import { after } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/db";
import { processRazorpayWebhook } from "@/lib/server/payments";

/**
 * Razorpay webhook endpoint. Verification, de-duplication and order updates
 * live in lib/server/payments.ts; this only adapts HTTP.
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return new Response("Database not configured", { status: 503 });
  const raw = await request.text();
  try {
    const result = await processRazorpayWebhook(
      raw,
      request.headers.get("x-razorpay-signature") ?? "",
      request.headers.get("x-razorpay-event-id"),
    );
    for (const job of result.followUps) after(() => job().catch((err) => console.error("[razorpay webhook] follow-up failed", err)));
    return typeof result.body === "string" ? new Response(result.body, { status: result.status }) : Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[razorpay webhook] update failed", err);
    // Non-2xx makes Razorpay retry later.
    return new Response("Temporary failure", { status: 500 });
  }
}
