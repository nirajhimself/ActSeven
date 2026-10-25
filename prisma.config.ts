import nextEnv from "@next/env";
import { defineConfig, env } from "prisma/config";

nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    url: env("DIRECT_URL"),
  },

  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
});