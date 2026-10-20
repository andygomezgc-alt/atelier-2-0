import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const engineName = "libquery_engine-rhel-openssl-3.0.x.so.node";
const warning = "WARN: Prisma rhel query engine not found under .next. " +
  "outputFileTracingIncludes glob may be outdated. " +
  "Lambda will likely fail on Vercel — investigate before deploy.\n";
let root;

function write(relative, content = "fixture") {
  const full = path.join(root, relative);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

function trace(route, engine, content) {
  const relative = `.next/server/app/api/${route}/route.js.nft.json`;
  const files = engine ? [path.relative(path.dirname(path.join(root, relative)), engine)] : [];
  write(relative, content ?? JSON.stringify({ version: 1, files }));
}

function run() {
  return spawnSync(process.execPath, [path.join(root, "scripts/check-prisma-engine.js")], {
    encoding: "utf8",
    cwd: root,
  });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "atelier-prisma-engine-test-"));
  mkdirSync(path.join(root, "scripts"));
  copyFileSync(fileURLToPath(new URL("./check-prisma-engine.js", import.meta.url)),
    path.join(root, "scripts/check-prisma-engine.js"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("Prisma postbuild engine check", () => {
  it("accepts existing engines referenced by every API route trace", () => {
    const engine = write(`node_modules/.prisma/client/${engineName}`);
    trace("health", engine);
    trace("recipes/[id]", engine);
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("OK: Prisma rhel engine traced (2 API route manifests).\n");
  });

  it("preserves physical-engine success output", () => {
    write(`.next/standalone/${engineName}`);
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`OK: Prisma rhel engine present (${path.join("standalone", engineName)}).\n`);
  });

  it("preserves the missing-build warning and successful exit", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("WARN: .next directory not found; skipping Prisma engine check.\n");
  });

  it.each(["missing-file", "missing-reference", "malformed-manifest", "no-api-manifest"])(
    "preserves the warning for %s instead of accepting incomplete trace evidence", (scenario) => {
      const engine = write(`node_modules/.prisma/client/${engineName}`);
      if (scenario === "no-api-manifest") {
        write(".next/next-server.js.nft.json", JSON.stringify({ version: 1, files: [engine] }));
      } else {
        trace("health", engine);
        if (scenario === "missing-file") trace("recipes", path.join(root, "missing", engineName));
        if (scenario === "missing-reference") trace("recipes", null);
        if (scenario === "malformed-manifest") trace("recipes", null, "{invalid");
      }
      const result = run();
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(warning);
    },
  );
});
