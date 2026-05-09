import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The api app imports source from sibling workspace packages.
  // Next 15 transpiles them automatically when listed here.
  transpilePackages: ["@atelier/db", "@atelier/shared", "@atelier/i18n"],
  // Keep Prisma out of the client bundle; only the server resolves it.
  serverExternalPackages: [
    "@prisma/client",
    "puppeteer",
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
  // Ensure Prisma's Linux query engine binary is copied into each
  // serverless function bundle. Required in monorepos with pnpm because
  // Next's tracer doesn't follow the @prisma/client → .prisma/client
  // shim across workspace boundaries. Glob is narrow to keep below the
  // 250MB lambda size limit (full client tree has all 8+ binaries).
  outputFileTracingIncludes: {
    "/api/**/*": [
      "../../node_modules/.pnpm/@prisma+client*/**/libquery_engine-rhel-openssl-3.0.x.so.node",
      "../../node_modules/.pnpm/@prisma+client*/**/schema.prisma",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
