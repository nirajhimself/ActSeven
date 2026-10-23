import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isDatabaseConfigured } from "./db";

declare global {
  var __actViiPrisma: PrismaClient | undefined;
}

/**
 * Prisma client over node-postgres. Uses the same rules as lib/server/db.ts:
 * TLS for hosted databases (Supabase, Neon), plain TCP for localhost.
 * Reused across hot reloads in development so edits don't leak connections.
 */
export function prisma() {
  const url = process.env.DATABASE_URL;
  if (!url || !isDatabaseConfigured()) throw new Error("DATABASE_URL is not configured");
  if (!globalThis.__actViiPrisma) {
    const { hostname } = new URL(url);
    const local = hostname === "localhost" || hostname === "127.0.0.1";
    // Matches postgres.js `ssl: "require"`: encrypted, without CA verification
    // (Supabase's pooler certificate isn't in Node's default trust store).
    const adapter = new PrismaPg({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: false } });
    globalThis.__actViiPrisma = new PrismaClient({ adapter });
  }
  return globalThis.__actViiPrisma;
}
