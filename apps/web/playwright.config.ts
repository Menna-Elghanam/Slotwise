import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { API_PORT, apiEnv, WEB_PORT, WEB_URL } from "./e2e/env";

const apiDir = fileURLToPath(new URL("../api", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  // The tests share one seeded database; running them one by one keeps them independent.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm exec tsx src/server.ts",
      cwd: apiDir,
      env: apiEnv,
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // A production build, so the test sees what users get (and no dev-mode compiling).
      command: `pnpm exec next build && pnpm exec next start --port ${WEB_PORT}`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
