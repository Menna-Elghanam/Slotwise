import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/node_modules/", "**/dist/", "**/.next/", "**/generated/"] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow intentionally unused params like `_next` (Express needs them in the signature).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // The Rules of Hooks and effect dependency checks catch real React bugs.
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // Vitest matchers like `expect.any(String)` are typed `any` by design.
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-unsafe-assignment": "off" },
  },
  // Must stay last: turns off rules that would fight with Prettier.
  prettier,
);
