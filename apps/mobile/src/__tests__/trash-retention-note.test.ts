// The trash empties itself after 7 days (/api/cron/purge-trash). Each trash screen
// shows the shared notice above its list. The screens are not rendered in tests
// (node environment), so this reads their source.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCREENS = ["app/recetas/papelera.tsx", "app/menus/papelera.tsx", "app/productos/papelera.tsx"];

describe("trash retention notice", () => {
  for (const screen of SCREENS) {
    it(`${screen} shows the 7-day notice as the list header`, () => {
      const source = readFileSync(join(ROOT, screen), "utf8");
      expect(source).toMatch(/ListHeaderComponent=\{\s*<Text style=\{styles\.note\}>\{t\("papelera_retention_note"\)\}<\/Text>\s*\}/);
    });
  }
});
