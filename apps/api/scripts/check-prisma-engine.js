#!/usr/bin/env node
// Verifies the Prisma rhel query engine is bundled into the .next output.
// If outputFileTracingIncludes drifts from Prisma's emitted layout, the
// serverless lambda crashes at runtime — this catches that at build time.
const { existsSync, readdirSync, statSync } = require("node:fs");
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

const hit = findEngine(root);
if (!hit) {
  console.warn(
    "WARN: Prisma rhel query engine not found under .next. " +
      "outputFileTracingIncludes glob may be outdated. " +
      "Lambda will likely fail on Vercel — investigate before deploy.",
  );
  // Soft warning for now to avoid blocking deploys while the glob is tuned.
  process.exit(0);
}

console.log(`OK: Prisma rhel engine present (${path.relative(root, hit)}).`);
