import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/tests/**/*.{test,spec}.ts", "src/tests/**/*.{test,spec}.tsx"],
    exclude: ["src/tests/e2e/**", "node_modules/**"],
    setupFiles: ["src/tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@postgen/application": path.resolve(__dirname, "packages/application/dist/index.js"),
      "@postgen/domain": path.resolve(__dirname, "packages/domain/dist/index.js"),
    },
  },
});
