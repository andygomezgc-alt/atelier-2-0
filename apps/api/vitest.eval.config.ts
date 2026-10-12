import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Solo las pruebas *.eval.ts, que llaman a los modelos de verdad: `pnpm test` nunca las recoge.
export default defineConfig({
  resolve: base.resolve,
  test: {
    environment: "node",
    globals: false,
    include: ["evals/**/*.eval.ts"],
    // Una corrida entera (casos × modos × reps, con reintentos) cabe en un solo test.
    testTimeout: 12 * 60 * 60 * 1000,
    hookTimeout: 60_000,
  },
});
