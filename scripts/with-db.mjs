// Runs a command with a database available.
//
//   node scripts/with-db.mjs [--memory] <command> [args...]
//
// If .env.local has a real DATABASE_URL, the command just runs against it.
// Otherwise a local Postgres-compatible database (PGlite) is started, Prisma
// migrations are applied, sample data is seeded if the catalogue is empty,
// and the command runs with DATABASE_URL pointing at it.
//   default:  data persists in .data/pglite (used by `npm run dev`)
//   --memory: a throwaway in-memory database (used by `npm run build`)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { connect, createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const args = process.argv.slice(2);
const memory = args[0] === "--memory";
const command = memory ? args.slice(1) : args;
if (command.length === 0) {
  console.error("Usage: node scripts/with-db.mjs [--memory] <command> [args...]");
  process.exit(1);
}

nextEnv.loadEnvConfig(process.cwd(), command.includes("dev"), { info() {}, error: console.error });
const configured = (url) => Boolean(url && !url.includes("YOUR_PASSWORD"));

const isWin = process.platform === "win32";
/** Prefer the project's local binary (node_modules/.bin), else whatever is on PATH. */
const bin = (name) => {
  const local = fileURLToPath(new URL(`../node_modules/.bin/${name}${isWin ? ".cmd" : ""}`, import.meta.url));
  return existsSync(local) ? local : name;
};
const run = (cmd, cmdArgs, env) => spawn(bin(cmd), cmdArgs, { stdio: "inherit", env, shell: isWin });

/**
 * Stops a child and everything it started. On Windows the child is a cmd.exe
 * shell, and killing only the shell would leave `next dev` running in the
 * background (still holding port 3000 with its old settings).
 */
function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (isWin) {
    // Full path: taskkill isn't always on PATH (e.g. some sandboxed shells).
    const taskkill = join(process.env.SystemRoot ?? "C:/Windows", "System32", "taskkill.exe");
    spawnSync(taskkill, ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

/** Runs the command as the final step and exits with it, cleaning up on any shutdown signal. */
function runToEnd(env, onExit = async () => {}) {
  const child = run(command[0], command.slice(1), env);
  let done = false;
  const finish = async (code) => {
    if (done) return;
    done = true;
    killTree(child);
    await onExit();
    process.exit(code);
  };
  child.on("exit", (code) => finish(code ?? 0));
  // SIGHUP: terminal closed; SIGBREAK: Ctrl+Break / console closing on Windows.
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, () => finish(0));
  return child;
}

const LOCAL_PORT = 5433;
const localUrl = (port) => `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
const sampleEnv = (port) => ({
  ...process.env,
  DATABASE_URL: localUrl(port),
  // Tells the app it's on sample data, so checkout runs as a labelled test.
  ACT_VII_SAMPLE_DB: process.env.ACT_VII_SAMPLE_DB ?? "1",
});
/** Is something (our local database, started by another `npm run …`) already listening? */
const listening = (port) =>
  new Promise((resolve) => {
    const sock = connect(port, "127.0.0.1", () => (sock.end(), resolve(true)));
    sock.on("error", () => resolve(false));
  });

if (configured(process.env.DATABASE_URL)) {
  runToEnd(process.env);
} else if (!memory && (await listening(LOCAL_PORT))) {
  // e.g. `npm run db:studio` while `npm run dev` is running: share its database
  // (PGlite's data folder must only be opened by one process).
  console.log(`▸ Using the local database already running on 127.0.0.1:${LOCAL_PORT}`);
  runToEnd(sampleEnv(LOCAL_PORT));
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");

  const freePort = () =>
    new Promise((resolve) => {
      const s = createServer().listen(0, "127.0.0.1", () => {
        const { port } = s.address();
        s.close(() => resolve(port));
      });
    });

  let dataDir = "memory://";
  if (!memory) {
    const dir = new URL("../.data/pglite/", import.meta.url);
    mkdirSync(dir, { recursive: true });
    dataDir = fileURLToPath(dir);
  }
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  const port = memory ? await freePort() : LOCAL_PORT;
  const server = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port, maxConnections: 10 });
  await server.start();

  const env = sampleEnv(port);
  // Async on purpose: the database server lives in this process, so blocking
  // the event loop (spawnSync) would stop it answering the child.
  const step = (label, cmd, cmdArgs) =>
    new Promise((resolve, reject) =>
      run(cmd, cmdArgs, env).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${label} failed`)))),
    );

  const closeDb = async () => {
    await server.stop().catch(() => {});
    await pg.close().catch(() => {});
  };

  try {
    console.log(`▸ Local database on 127.0.0.1:${port} (${memory ? "in memory" : ".data/pglite"}) — no DATABASE_URL in .env.local`);
    await step("Migrations", "prisma", ["migrate", "deploy"]);
    const { rows } = await pg.query("select count(*)::int as n from products");
    if (rows[0].n === 0) await step("Seeding", "prisma", ["db", "seed"]);
    else console.log(`▸ Catalogue already has ${rows[0].n} products (run \`npm run db:seed\` to reset sample data)`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    await closeDb();
    process.exit(1);
  }

  runToEnd(env, closeDb);
}
