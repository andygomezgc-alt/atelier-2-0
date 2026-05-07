import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The api app imports source from sibling workspace packages.
  // Next 15 transpiles them automatically when listed here.
  transpilePackages: ["@atelier/db", "@atelier/shared", "@atelier/i18n"],
  // Keep Prisma out of the client bundle; only the server resolves it.
  serverExternalPackages: ["@prisma/client"],
};

export default config;
