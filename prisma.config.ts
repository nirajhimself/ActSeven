import nextEnv from "@next/env";
import { defineConfig } from "prisma/config";

// Load .env.local (and friends) exactly as Next.js does, so the Prisma CLI
// and the app use the same DATABASE_URL. Variables already set in the
// environment win, which is how the local-database launcher points Prisma
// at its own database.
nextEnv.loadEnvConfig(process.cwd());
process.env.DIRECT_URL ||= process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
});
