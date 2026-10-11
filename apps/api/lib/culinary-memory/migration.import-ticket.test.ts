import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../packages/db/prisma/", import.meta.url);
describe("additive import ticket for grouped learning", () => {
  it("adds only importTicket and importPendingAt to CulinaryMemory after the memory-on migration", () => {
    const entries = readdirSync(new URL("migrations/", root)).filter(name => /^\d{14}_/.test(name));
    const candidates = entries.filter(name => /^\d{14}_culinary_memory_import_ticket$/.test(name));
    expect(candidates).toHaveLength(1);
    const name = candidates[0]!;
    expect(name > "20261010120000_memoria_encendida").toBe(true);
    const sql = readFileSync(new URL(`migrations/${name}/migration.sql`, root), "utf8")
      .replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
    expect(sql).toBe('ALTER TABLE "CulinaryMemory" ADD COLUMN "importPendingAt" TIMESTAMP(3), ADD COLUMN "importTicket" INTEGER NOT NULL DEFAULT 0;');
    const schema = readFileSync(new URL("schema.prisma", root), "utf8");
    const model = schema.match(/model CulinaryMemory \{([\s\S]*?)\n\}/)?.[1];
    expect(model).toMatch(/^\s*importTicket\s+Int\s+@default\(0\)\s*$/m);
    expect(model).toMatch(/^\s*importPendingAt\s+DateTime\?\s*$/m);
  });
});
