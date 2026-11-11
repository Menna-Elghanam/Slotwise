import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// The Prisma CLI doesn't read .env by itself. In CI, variables come from the environment.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
