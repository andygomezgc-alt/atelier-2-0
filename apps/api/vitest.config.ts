import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Las pruebas contra PostgreSQL real solo corren a propósito (CULINARY_MEMORY_IT=1).
    exclude: process.env.CULINARY_MEMORY_IT === "1" ? configDefaults.exclude : [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
  resolve: {
    alias: [
      {
        find: /^@atelier\/shared\/(.+)$/,
        replacement: fileURLToPath(new URL("../../packages/shared/src/$1.ts", import.meta.url)),
      },
      { find: "@", replacement: fileURLToPath(new URL("./", import.meta.url)) },
      { find: "@atelier/db", replacement: fileURLToPath(new URL("../../packages/db/src/index.ts", import.meta.url)) },
      { find: "@atelier/shared", replacement: fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) },
    ],
  },
});
