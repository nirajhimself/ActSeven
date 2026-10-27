import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isDatabaseConfigured, poolSize } from "./db";

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
      max: poolSize(),
      ssl: local ? false : { rejectUnauthorized: false },
      // A distant pooler (or a sleeping laptop) can drop idle connections;
      // keep-alives and recycling make it less likely we're handed a dead one.
      // Probe after 10 s: left unset, the OS default applies (2 hours on Windows).
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      // Connections are slow to open (see lib/server/db.ts): keep them open between visits.
      idleTimeoutMillis: 600_000,
      maxLifetimeSeconds: 1_800,
      connectionTimeoutMillis: 20_000,
      // Give up on a query that gets no answer (e.g. a socket the network
      // dropped) instead of waiting forever.
      query_timeout: 30_000,
    });
    globalThis.__actViiPrisma = new PrismaClient({
      adapter,
      // Prisma closes interactive transactions after 5 s by default. Against a
      // distant database (~0.5–1 s a round trip) a product save with many
      // variants takes longer, and the transaction was closed under it
      // ("Transaction not found", P2028). These limits leave ample headroom.
      transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    });
  }
  return globalThis.__actViiPrisma;
}

/** Discards the Prisma client so the next prisma() call starts with fresh connections. */
export function resetPrisma() {
  const stale = globalThis.__actViiPrisma;
  globalThis.__actViiPrisma = undefined;
  stale?.$disconnect().catch(() => {});
}

// Network failures (a dropped socket, a failed connect or DNS lookup), as
// reported by postgres.js, node-postgres and Prisma (P1001 "Can't reach
// database server", P1002 timeout, P1017 server closed the connection).
const TRANSIENT =
  /Connection terminated|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|CONNECT_TIMEOUT|CONNECTION_CLOSED|terminating connection|Server has closed the connection|Connection ended|Can't reach database server|P10(01|02|17)/i;

export function isTransientDbError(err: unknown) {
  const e = err as { code?: unknown; message?: unknown } | null;
  return TRANSIENT.test(`${e?.code ?? ""} ${e?.message ?? err}`);
}

const RETRY_DELAYS_MS = [500, 2_000];

/**
 * Runs a read-only query, retrying up to twice (after 0.5 s, then 2 s) if the
 * database couldn't be reached or the connection dropped mid-flight — brief
 * network blips then cost a moment instead of an error page.
 * Only for reads: retrying a write could apply it twice.
 */
export async function withReadRetry<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isTransientDbError(err)) throw err;
      console.warn(`[db] database unreachable during a read; retrying (${attempt + 1}/${RETRY_DELAYS_MS.length})`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}
