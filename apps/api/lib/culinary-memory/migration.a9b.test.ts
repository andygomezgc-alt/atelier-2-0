import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../packages/db/prisma/", import.meta.url);
describe("A9b additive suppression expiry and discard streak", () => {
  it("adds only lastFailedAt and discardStreak to CulinaryMemory after every earlier migration", () => {
    const entries = readdirSync(new URL("migrations/", root)).filter(name => /^\d{14}_/.test(name));
    const candidates = entries.filter(name => /^\d{14}_culinary_memory_suppression_expiry$/.test(name));
    expect(candidates).toHaveLength(1);
    const name = candidates[0]!;
    expect(name > "20261007190000_culinary_memory_failure_tracking").toBe(true);
    const sql = readFileSync(new URL(`migrations/${name}/migration.sql`, root), "utf8")
      .replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
    expect(sql).toBe('ALTER TABLE "CulinaryMemory" ADD COLUMN "discardStreak" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "lastFailedAt" TIMESTAMP(3);');
    const schema = readFileSync(new URL("schema.prisma", root), "utf8");
    const model = schema.match(/model CulinaryMemory \{([\s\S]*?)\n\}/)?.[1];
    expect(model).toMatch(/^\s*lastFailedAt\s+DateTime\?\s*$/m);
    expect(model).toMatch(/^\s*discardStreak\s+Int\s+@default\(0\)\s*$/m);
  });
});
