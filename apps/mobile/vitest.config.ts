import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    // Match the `@/*` path alias from tsconfig.json so tests can resolve
    // module specifiers like "@/src/lib/secure-storage".
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
