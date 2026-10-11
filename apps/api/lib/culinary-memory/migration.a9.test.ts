import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../packages/db/prisma/", import.meta.url);
describe("A9 additive input-failure tracking", () => {
  it("adds only two nullable CulinaryMemory columns after A7 without a data rewrite", () => {
    const candidates = readdirSync(new URL("migrations/", root)).filter(name => /^\d{14}_culinary_memory_failure_tracking$/.test(name));
    expect(candidates).toHaveLength(1);
    const name = candidates[0]!;
    expect(name > "20261007155532_message_generation_link").toBe(true);
    const sql = readFileSync(new URL(`migrations/${name}/migration.sql`, root), "utf8")
      .replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
    expect(sql).toBe('ALTER TABLE "CulinaryMemory" ADD COLUMN "failureCount" INTEGER, ADD COLUMN "lastFailedInputHash" TEXT;');
    const schema = readFileSync(new URL("schema.prisma", root), "utf8");
    const model = schema.match(/model CulinaryMemory \{([\s\S]*?)\n\}/)?.[1];
    expect(model).toMatch(/^\s*lastFailedInputHash\s+String\?\s*$/m);
    expect(model).toMatch(/^\s*failureCount\s+Int\?\s*$/m);
  });
});
