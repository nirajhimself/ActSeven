"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { adminSignIn, audit, endAdminSession, getAdminSession } from "@/lib/server/admin-session";
import { clientIp } from "@/lib/server/admin";

export type SignInState = { error: string | null };

/** Only same-site admin paths are allowed as the post-sign-in destination. */
const safeNext = (raw: FormDataEntryValue | null) => {
  const next = String(raw ?? "");
  return /^\/admin(\/[A-Za-z0-9/_\-?=&%.]*)?$/.test(next) && !next.startsWith("/admin/login") ? next : "/admin";
};

export async function adminSignInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const result = await adminSignIn(String(formData.get("username") ?? "").slice(0, 100), String(formData.get("password") ?? "").slice(0, 200), {
    ip: await clientIp(),
    userAgent: (await headers()).get("user-agent"),
  });
  if (!result.ok) return { error: result.error };
  (await cookies()).set(ADMIN_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    expires: result.expiresAt,
  });
  redirect(safeNext(formData.get("next")));
}

export async function adminSignOutAction() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  const session = await getAdminSession(token);
  if (session) await audit({ username: session.username, ip: await clientIp() }, "admin.sign_out", "admin", null);
  await endAdminSession(token);
  jar.delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin/login");
}
