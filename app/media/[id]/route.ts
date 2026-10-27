import { getMedia } from "@/lib/server/media";
import { withReadRetry } from "@/lib/server/prisma";

/**
 * Serves photos uploaded in the admin. An id is a hash of the file's content,
 * so a URL always shows the same image: browsers and the CDN can keep it for
 * a year without asking again.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/[id]">) {
  const { id } = await params;
  const media = await withReadRetry(() => getMedia(id)).catch((err) => {
    console.error("[media] read failed", err);
    return undefined;
  });
  if (media === undefined) return new Response("Temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!media) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(media.bytes), {
    headers: {
      "Content-Type": media.contentType,
      "Content-Length": String(media.bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
