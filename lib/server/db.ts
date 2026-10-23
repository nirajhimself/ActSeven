import "server-only";
import postgres from "postgres";

declare global {
  var __actViiSql: postgres.Sql | undefined;
}

export function isDatabaseConfigured() {
  const url = process.env.DATABASE_URL;
  return Boolean(url && !url.includes("YOUR_PASSWORD"));
}

/**
 * True when running on the local sample database started by scripts/with-db.mjs
 * (no DATABASE_URL configured). Checkout is then a clearly labelled test:
 * orders are priced and checked but never stored, charged or shipped.
 */
export function isSampleDatabase() {
  return process.env.ACT_VII_SAMPLE_DB === "1";
}

/** Connection options that work for local Postgres and Supabase alike. */
export function connectionOptions(url: string): postgres.Options<Record<string, never>> {
  const { hostname, port } = new URL(url);
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  return {
    max: 5,
    idle_timeout: 20,
    onnotice: () => {},
    // Hosted databases (Supabase, Neon) require TLS.
    ssl: local ? false : "require",
    // Supabase's transaction pooler (port 6543) doesn't support prepared statements.
    prepare: port !== "6543",
  };
}

/**
 * Lazily created connection pool, reused across hot reloads in development so
 * edits don't leak connections.
 */
export function db() {
  const url = process.env.DATABASE_URL;
  if (!url || !isDatabaseConfigured()) throw new Error("DATABASE_URL is not configured");
  globalThis.__actViiSql ??= postgres(url, connectionOptions(url));
  return globalThis.__actViiSql;
}
