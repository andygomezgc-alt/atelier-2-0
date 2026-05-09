import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The api app imports source from sibling workspace packages.
  // Next 15 transpiles them automatically when listed here.
  transpilePackages: ["@atelier/db", "@atelier/shared", "@atelier/i18n"],
  // Keep Prisma out of the client bundle; only the server resolves it.
  serverExternalPackages: ["@prisma/client"],
  // Ensure Prisma's native query engine binary is copied into each
  // serverless function bundle. Required in monorepos with pnpm because
  // Next's tracer doesn't follow the @prisma/client → .prisma/client
  // shim across workspace boundaries.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "../../node_modules/.pnpm/@prisma+client*/**/*",
      "../../node_modules/.prisma/**/*",
    ],
  },
};

export default config;
