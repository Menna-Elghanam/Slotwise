import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { apiEnv } from "./env";

const apiDir = fileURLToPath(new URL("../../api", import.meta.url));

/** Fresh demo data before every run: migrate, empty, seed. */
export default function globalSetup(): void {
  const run = (command: string) =>
    execSync(command, { cwd: apiDir, stdio: "inherit", env: { ...process.env, ...apiEnv } });
  run("pnpm exec prisma migrate deploy");
  run("pnpm exec tsx src/scripts/reset-database.ts");
  run("pnpm exec tsx src/scripts/seed.ts");
}
