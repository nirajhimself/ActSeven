import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { checkAdminAuth } from "@/lib/admin-auth";

/** Server-side admin check for pages and actions (defence in depth behind proxy.ts). */
export async function requireAdmin() {
  const h = await headers();
  if (!checkAdminAuth(h.get("authorization"))) notFound();
}
