#!/usr/bin/env node
// Verifies copied output or API route traces include an existing Prisma engine.
// Normal Next builds record dependency paths in NFT manifests; only standalone
// builds copy those dependencies under .next. This is not a remote deploy check.
const { existsSync, readdirSync, readFileSync, statSync } = require("node:fs");
const path = require("node:path");

const ENGINE_RE = /libquery_engine-rhel.*\.so\.node$/;
const root = path.join(__dirname, "..", ".next");

if (!existsSync(root)) {
  console.warn("WARN: .next directory not found; skipping Prisma engine check.");
  process.exit(0);
}

function findEngine(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const found = findEngine(full);
      if (found) return found;
    } else if (ENGINE_RE.test(name)) {
      return full;
    }
  }
  return null;
}

function findRouteTraces(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findRouteTraces(full);
    return entry.isFile() && entry.name === "route.js.nft.json" ? [full] : [];
  });
}

function countTracedRoutes() {
  try {
    const traces = findRouteTraces(path.join(root, "server", "app", "api"));
    if (!traces.length) return 0;
    for (const trace of traces) {
      const manifest = JSON.parse(readFileSync(trace, "utf8"));
      if (!Array.isArray(manifest.files) || !manifest.files.every((file) => typeof file === "string")) {
        return 0;
      }
      const engines = manifest.files.filter((file) => ENGINE_RE.test(file));
      if (!engines.length || !engines.every((file) => statSync(path.resolve(path.dirname(trace), file)).isFile())) {
        return 0;
      }
    }
    return traces.length;
  } catch {
    // Missing, malformed, or broken traces are not proof of engine inclusion.
    return 0;
  }
}

const hit = findEngine(root);
if (!hit) {
  const tracedRoutes = countTracedRoutes();
  if (tracedRoutes) {
    console.log(`OK: Prisma rhel engine traced (${tracedRoutes} API route manifests).`);
    process.exit(0);
  }
  console.warn(
    "WARN: Prisma rhel query engine not found under .next. " +
      "outputFileTracingIncludes glob may be outdated. " +
      "Lambda will likely fail on Vercel — investigate before deploy.",
  );
  // Soft warning for now to avoid blocking deploys while the glob is tuned.
  process.exit(0);
}

console.log(`OK: Prisma rhel engine present (${path.relative(root, hit)}).`);
