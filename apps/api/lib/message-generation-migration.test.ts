import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const prismaRoot = new URL("../../../packages/db/prisma/", import.meta.url);
const migrationsRoot = new URL("migrations/", prismaRoot);

// Snapshot of the migrations that existed before A7. Later migrations must not
// affect this additive migration's ordering regression.
const priorMigrations = [
  "20260507000000_init",
  "20260507180000_move_presentation_style_to_folder",
  "20260510000000_jwt_revocation_and_audit_log",
  "20260510010000_indexes_cascades_softdelete",
  "20260510020000_add_idea_to_conversation",
  "20260511190000_byok_custom_provider",
  "20260512100000_menu_sections",
  "20260513000000_menu_client_override",
  "20260513223000_add_indexes_auth_userid",
  "20260514000000_banco_productos",
  "20260518100000_add_pezzatura_structured",
  "20260522180000_menu_in_service",
  "20260525120000_allergens",
  "20260708120000_add_ai_usage",
  "20260710000000_menu_soft_delete",
  "20260713120000_restaurant_plan",
  "20260714120000_menu_custom_style",
  "20260717000000_menuitem_recipeid_index",
  "20260717000000_stripe_webhook_idempotency",
  "20260718120000_drop_byok_columns",
  "20260720120000_menu_custom_theme",
  "20260721120000_message_client_id",
  "20260906070000_product_allergens_review",
  "20260906160000_reliable_saves_and_chat",
  "20260907020000_menu_units_and_style_versions",
  "20260908010000_culinary_memory",
  "20260909190000_retryable_ideas",
  "20260910120000_ai_pilot_budget",
  "20260910150000_weekly_daily_chat",
  "20260913010000_culinary_memory_reliability",
  "20260929230000_chef_notes",
] as const;

describe("A7 additive Message migration", () => {
  it("has a timestamped migration after all prior migrations and only adds nullable columns and an index", () => {
    const directories = readdirSync(fileURLToPath(migrationsRoot), { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    const candidates = directories.filter(name => /^\d{14}_message_generation_link$/.test(name));
    expect(candidates).toHaveLength(1);
    const name = candidates[0]!;
    expect(directories).toEqual(expect.arrayContaining([...priorMigrations]));
    for (const prior of priorMigrations) {
      expect(name > prior, `${name} must sort after ${prior}`).toBe(true);
    }
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
