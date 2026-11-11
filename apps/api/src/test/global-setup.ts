import { execSync } from "node:child_process";

/** Runs once before all test files: brings the test database up to the latest migration. */
export default function setup(): void {
  process.loadEnvFile(".env.test");
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env: process.env });
}
