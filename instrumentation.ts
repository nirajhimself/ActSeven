import type { Instrumentation } from "next";

/**
 * Runs once when the server starts: reports configuration problems in the
 * logs (Vercel → Logs) without ever printing secret values.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkConfig } = await import("./lib/server/config");
  for (const f of checkConfig()) {
    const line = `[config] ${f.level.toUpperCase()} ${f.key}: ${f.message}`;
    if (f.level === "error") console.error(line);
    else console.warn(line);
  }
  // Recovers database connections that stop answering, without a restart.
  const { isDatabaseConfigured } = await import("./lib/server/db");
  if (isDatabaseConfigured()) {
    (await import("./lib/server/db-watchdog")).startDbWatchdog();
    // Open a connection in each client now, so the first visitor doesn't wait
    // for it (several seconds to a distant database). Failures are harmless.
    const { db } = await import("./lib/server/db");
    const { prisma } = await import("./lib/server/prisma");
    db()`select 1`.catch(() => {});
    prisma().$queryRaw`select 1`.catch(() => {});
  }
}

/**
 * Server errors as one JSON line each, easy to search and alert on in the
 * host's logs. Request headers and cookies are deliberately left out
 * (they carry personal data and session tokens).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const error = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      source: "next",
      message: error?.message?.slice(0, 500),
      digest: error?.digest,
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
      renderSource: "renderSource" in context ? context.renderSource : undefined,
      // Not `new Date()`: this also runs for errors during prerendering, where
      // Next.js rejects reading the clock and would report a second error.
      time: new Date(performance.timeOrigin + performance.now()).toISOString(),
    }),
  );
};
