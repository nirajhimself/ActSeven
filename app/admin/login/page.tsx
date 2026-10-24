import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Monogram } from "@/components/brand/Logo";
import { AdminSignInForm } from "@/components/admin/AdminSignInForm";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { getAdminSession } from "@/lib/server/admin-session";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <div className="shell flex justify-center py-16 lg:py-24">
      <div className="w-full max-w-sm">
        <Monogram className="h-10 w-auto text-obsidian" />
        <p className="eyebrow mt-8">Admin</p>
        <h1 className="display mt-3 text-4xl">Sign in</h1>
        <Suspense fallback={<div aria-busy="true" className="mt-8 h-64 animate-pulse bg-bone/60" />}>
          <SignIn searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function SignIn({ searchParams }: { searchParams: PageProps<"/admin/login">["searchParams"] }) {
  const [sp, jar] = await Promise.all([searchParams, cookies()]);
  if (await getAdminSession(jar.get(ADMIN_COOKIE)?.value)) redirect("/admin");
  const next = typeof sp.next === "string" ? sp.next : "/admin";
  return <AdminSignInForm next={next} />;
}
