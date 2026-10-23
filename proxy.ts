import { NextResponse, type NextRequest } from "next/server";
import { checkAdminAuth, isAdminEnabled } from "@/lib/admin-auth";

/**
 * Gates /admin behind HTTP Basic auth. Admin pages and actions re-check the
 * credentials on the server too (lib/server/admin.ts) — this is the first line.
 */
export function proxy(request: NextRequest) {
  if (!isAdminEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!checkAdminAuth(request.headers.get("authorization"))) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="ACT VII admin", charset="UTF-8"' },
    });
  }
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
