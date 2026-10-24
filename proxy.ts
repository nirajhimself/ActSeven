import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isAdminEnabled } from "@/lib/admin-auth";

/**
 * First gate for /admin: hidden entirely (404) until ADMIN_PASSWORD is set,
 * and visitors without a session cookie go to the sign-in page. The session
 * itself is verified against the database by every admin page and action
 * (lib/server/admin.ts) — this only avoids rendering anything for them.
 */
export function proxy(request: NextRequest) {
  if (!isAdminEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/admin/login" && !request.cookies.get(ADMIN_COOKIE)?.value) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", pathname + search);
    return withAdminHeaders(NextResponse.redirect(login));
  }
  return withAdminHeaders(NextResponse.next());
}

function withAdminHeaders(res: NextResponse) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "same-origin");
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
