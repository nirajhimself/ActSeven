import "server-only";
import { resetDb } from "./db";
import { resetPrisma } from "./prisma";

declare global {
  var __actViiDbWatchdog: ReturnType<typeof setInterval> | undefined;
}

const answers = (query: Promise<unknown>, withinMs: number) =>
  Promise.race([
    query.then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), withinMs).unref?.()),
  ]);

/**
 * Keeps the database clients usable in a long-running server. Every 30 s it
 * asks each client that's in use for `select 1`; one that doesn't answer is
 * stuck (typically every connection waiting on a socket the network or the
 * pooler dropped), so it's discarded and the next query reconnects. Without
 * this, pages that need it wait forever until the server restarts.
 */
export function startDbWatchdog({ everyMs = 30_000, answerWithinMs = 15_000 } = {}) {
  // answerWithinMs is generous: a fresh connection to a distant database can take several seconds.
  if (globalThis.__actViiDbWatchdog) return;
  let checking = false;
  globalThis.__actViiDbWatchdog = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const sql = globalThis.__actViiSql;
      if (sql && !(await answers(sql`select 1`, answerWithinMs))) {
        console.warn("[db] postgres.js pool stopped answering; reconnecting");
        resetDb();
      }
      const client = globalThis.__actViiPrisma;
      if (client && !(await answers(client.$queryRaw`select 1`, answerWithinMs))) {
        console.warn("[db] Prisma pool stopped answering; reconnecting");
        resetPrisma();
      }
    } finally {
      checking = false;
    }
  }, everyMs);
  globalThis.__actViiDbWatchdog.unref?.();
}

export function stopDbWatchdog() {
  clearInterval(globalThis.__actViiDbWatchdog);
  globalThis.__actViiDbWatchdog = undefined;
}
