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
      time: new Date().toISOString(),
    }),
  );
};
