import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global-setup.ts"],
    setupFiles: ["./src/test/load-env.ts"],
    // Test files share one database, so run them one at a time to avoid wiping each other's data.
    fileParallelism: false,
  },
});
