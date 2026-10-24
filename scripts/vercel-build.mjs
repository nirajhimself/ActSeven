// Vercel runs this instead of `npm run build` (package.json "vercel-build").
//
// Production deployments apply pending database migrations first, so the
// code never runs against an older schema; if a migration fails, the deploy
// stops and the live site keeps running the previous version.
// Preview deployments never migrate: point their DATABASE_URL at a separate
// database (see docs/LAUNCH.md) so previews can't touch live orders.
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV ?? "development";
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set for this Vercel environment. Add it under Project → Settings → Environment Variables.");
  process.exit(1);
}

if (env === "production") {
  console.log("▸ Production deploy: applying database migrations");
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  console.log(`▸ ${env} deploy: skipping migrations (only production deploys migrate)`);
}

run("node", ["scripts/with-db.mjs", "next", "build"]);
