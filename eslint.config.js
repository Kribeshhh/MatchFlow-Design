import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "server-dist/**", ".local/**", "preview/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-namespace": "off",
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "packages/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["**/apps/api/**", "@prisma/client", "node:*", "express", "dotenv*"] },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/**/service.ts"],
    rules: { "no-restricted-imports": ["error", { paths: ["express"] }] },
  },
  {
    files: ["tests/integration/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
