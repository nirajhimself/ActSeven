import { checkCart } from "@/lib/server/cart";
import { isDatabaseConfigured } from "@/lib/server/db";

/**
 * Live check of a bag: availability and current prices per line, plus server
 * totals. Read-only, and a Route Handler rather than a Server Action because
 * actions run one at a time: this check would otherwise wait behind the bag
 * sync (and anything else) the page starts on load.
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return Response.json(null);
  const body = (await request.json().catch(() => null)) as { lines?: unknown; method?: unknown; code?: unknown } | null;
  const method = body?.method === "cod" ? "cod" : body?.method === "razorpay" ? "razorpay" : undefined;
  try {
    return Response.json(await checkCart(body?.lines, method, body?.code), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cart] check failed", err);
    return Response.json(null, { status: 503 });
  }
}
