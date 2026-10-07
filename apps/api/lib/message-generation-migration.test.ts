import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const prismaRoot = new URL("../../../packages/db/prisma/", import.meta.url);
const migrationsRoot = new URL("migrations/", prismaRoot);

describe("A7 additive Message migration", () => {
  it("has a timestamped migration after all prior migrations and only adds nullable columns and an index", () => {
    const directories = readdirSync(fileURLToPath(migrationsRoot), { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    const candidates = directories.filter(name => /^\d{14}_message_generation_link$/.test(name));
    expect(candidates).toHaveLength(1);
    const name = candidates[0]!;
    expect(directories.at(-1)).toBe(name);
    const sql = readFileSync(new URL(`${name}/migration.sql`, migrationsRoot), "utf8")
      .replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
    expect(sql).toBe('ALTER TABLE "Message" ADD COLUMN "cacheWriteTokens" INTEGER, ADD COLUMN "generationId" TEXT; '
      + 'CREATE INDEX "Message_generationId_idx" ON "Message"("generationId");');
  });

  it("declares an optional generation id and cache writes without a relation or unique constraint", () => {
    const schema = readFileSync(new URL("schema.prisma", prismaRoot), "utf8");
    const message = schema.match(/model Message \{([\s\S]*?)\n\}/)?.[1];
    expect(message).toBeDefined();
    expect(message).toMatch(/^\s*generationId\s+String\?\s*$/m);
    expect(message).toMatch(/^\s*cacheWriteTokens\s+Int\?\s*$/m);
    expect(message).toContain("@@index([generationId])");
  });
});
