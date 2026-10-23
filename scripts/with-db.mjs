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
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { connect, createServer } from "node:net";
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
  const child = run(command[0], command.slice(1), process.env);
  child.on("exit", (code) => process.exit(code ?? 0));
} else if (!memory && (await listening(LOCAL_PORT))) {
  // e.g. `npm run db:studio` while `npm run dev` is running: share its database
  // (PGlite's data folder must only be opened by one process).
  console.log(`▸ Using the local database already running on 127.0.0.1:${LOCAL_PORT}`);
  const child = run(command[0], command.slice(1), sampleEnv(LOCAL_PORT));
  child.on("exit", (code) => process.exit(code ?? 0));
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

  let child;
  const stop = async (code = 0) => {
    child?.kill();
    await server.stop().catch(() => {});
    await pg.close().catch(() => {});
    process.exit(code);
  };
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));

  try {
    console.log(`▸ Local database on 127.0.0.1:${port} (${memory ? "in memory" : ".data/pglite"}) — no DATABASE_URL in .env.local`);
    await step("Migrations", "prisma", ["migrate", "deploy"]);
    const { rows } = await pg.query("select count(*)::int as n from products");
    if (rows[0].n === 0) await step("Seeding", "prisma", ["db", "seed"]);
    else console.log(`▸ Catalogue already has ${rows[0].n} products (run \`npm run db:seed\` to reset sample data)`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    await stop(1);
  }

  child = run(command[0], command.slice(1), env);
  child.on("exit", (code) => stop(code ?? 0));
}
