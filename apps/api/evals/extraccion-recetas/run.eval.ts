// Extraction bench: every fixture through the production validation and the
// extraction pipeline, graded by checks.ts.
//
//   pnpm -C apps/api eval:extraccion
//     Mode A (default): the recorded model outputs in fixtures.ts. Offline.
//   EVAL_LIVE=1 pnpm -C apps/api eval:extraccion
//     Mode B: one real GLM call per fixture through extractRecipeFromText
//     (paid; needs ZAI_API_KEY in the environment). Prints each model output
//     so a good one can be recorded as a new mode A variant.
//
// Only the AI budget is mocked, so nothing touches the database.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/ai/budget", () => ({
  reserveGeneration: async () => ({ id: "eval" }),
  settleGeneration: async () => undefined,
}));

import { extractRecipeFromText, parseExtractedRecipe, type ExtractedRecipe } from "../../lib/recipe-extraction";
import { standardizeExtractedRecipe } from "../../lib/recipes/extraction-pipeline";
import { checkExtraction } from "./checks";
import { FIXTURES } from "./fixtures";

const LIVE = process.env.EVAL_LIVE === "1";

async function outputs(fixture: (typeof FIXTURES)[number]): Promise<Array<[string, ExtractedRecipe]>> {
  if (!LIVE) return Object.entries(fixture.recorded).map(([variant, raw]) => [variant, parseExtractedRecipe(raw)]);
  const extracted = await extractRecipeFromText(fixture.input, undefined, fixture.source);
  console.log(`\n── ${fixture.id} (live model output)\n${JSON.stringify(extracted, null, 2)}`);
  return [["live", extracted]];
}

describe(`extraction bench, ${LIVE ? "mode B (live GLM)" : "mode A (recorded outputs)"}`, () => {
  it("every fixture passes the deterministic checks", async () => {
    if (LIVE && !process.env.ZAI_API_KEY?.trim()) throw new Error("EVAL_LIVE=1 needs ZAI_API_KEY in the environment");
    const rows: Array<Record<string, string | number>> = [];
    const failures: string[] = [];
    for (const fixture of FIXTURES) {
      for (const [variant, extracted] of await outputs(fixture)) {
        const { response, stats } = standardizeExtractedRecipe(extracted, fixture.bank);
        const found = checkExtraction(response, fixture.expected);
        failures.push(...found.map((f) => `${fixture.id}/${variant}: ${f}`));
        rows.push({ fixture: fixture.id, variant, ...stats, pending: response.pendingMatches.length, failures: found.length });
      }
    }
    console.table(rows);
    for (const failure of failures) console.log(`  ✗ ${failure}`);
    expect(failures).toEqual([]);
  });
});
