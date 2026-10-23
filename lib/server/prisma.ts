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
    const adapter = new PrismaPg({
      connectionString: url,
      max: 5,
      ssl: local ? false : { rejectUnauthorized: false },
      // A distant pooler (or a sleeping laptop) can drop idle connections;
      // keep-alives and recycling make it less likely we're handed a dead one.
      keepAlive: true,
      idleTimeoutMillis: 10_000,
      maxLifetimeSeconds: 600,
      connectionTimeoutMillis: 20_000,
    });
    globalThis.__actViiPrisma = new PrismaClient({ adapter });
  }
  return globalThis.__actViiPrisma;
}

const TRANSIENT = /Connection terminated|ECONNRESET|ETIMEDOUT|EPIPE|terminating connection|Server has closed the connection|Connection ended/i;

/**
 * Runs a read-only query, retrying once if the connection dropped mid-flight.
 * Only for reads: retrying a write could apply it twice.
 */
export async function withReadRetry<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    if (!TRANSIENT.test(String((err as Error)?.message ?? err))) throw err;
    console.warn("[db] connection dropped during a read; retrying once");
    return read();
  }
}
