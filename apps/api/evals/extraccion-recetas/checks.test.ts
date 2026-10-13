// Mode A of the extraction bench inside `pnpm test`: every recorded model
// output goes through the production validation and pipeline, offline.
import { describe, expect, it } from "vitest";
import type { ExtractedRecipeResponse } from "@atelier/shared";
import { checkExtraction, runRecorded } from "./checks";
import { FIXTURES, type Fixture } from "./fixtures";

const fixture = (id: string): Fixture => FIXTURES.find((f) => f.id === id)!;

describe.each(FIXTURES.map((f) => [f.id, f] as const))("%s", (_id, f) => {
  it.each(Object.keys(f.recorded))("%s output passes every check", (variant) => {
    const { response } = runRecorded(f.recorded[variant], f.bank);
    expect(checkExtraction(response, f.expected)).toEqual([]);
  });
});

describe("chat-calamar", () => {
  const calamar = fixture("chat-calamar");

  it.each(Object.keys(calamar.recorded))("%s: AOVE is «AOVE» in «Aceite de chorizo», and the squid is «4 ud calamar» at 350 g", (variant) => {
    const rows = runRecorded(calamar.recorded[variant], calamar.bank).response.recipeIngredients;
    expect(rows.find((r) => r.rawText === "40 g AOVE")).toMatchObject({ section: "Aceite de chorizo", note: null, productId: "p-aove" });
    expect(rows.find((r) => r.rawText === "4 ud calamar")).toMatchObject({ section: "Tripa", pesoCalculoG: 350, qty: 4, unit: "unidad" });
  });

  it("live mode sends the assistant's message after the chef's", () => {
    expect(calamar.input).toMatch(/^CHEF: .+\nASISTENTE: \*\*Calamar embutido al pimentón\*\*/);
  });
});

describe("checkExtraction", () => {
  const calamar = fixture("chat-calamar");
  const flattened = (calamar.recorded.flattened as { ingredients: string[] }).ingredients;

  it("fails the response the routes built before the pipeline", () => {
    // The old loop: the model's line as rawText, no section, no note.
    const before: ExtractedRecipeResponse = {
      title: "Calamar embutido al pimentón",
      portions: 16,
      contentJson: { ingredients: flattened, method: [], notes: "" },
      recipeIngredients: flattened.map((rawText) => ({ rawText, productId: null })),
      pendingMatches: [{ ingredientIdx: 1, productId: "p-chorizo", productName: "Chorizo" }],
    };
    const failures = checkExtraction(before, calamar.expected);
    expect(failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/^#2 «40 g AOVE \(aceite de chorizo\)»: no measure/),
      expect.stringMatching(/^#2 «40 g AOVE \(aceite de chorizo\)»: section text inside the name/),
      "sections [], expected [tripa, aceite de chorizo, farsa]",
      "product p-chorizo must never be linked or offered",
    ]));
  });

  it("flags a line without measure or note", () => {
    const { response } = runRecorded({ title: "Bizcocho", portions: null, method: [], notes: "", ingredients: ["Levadura fresca"] }, []);
    expect(checkExtraction(response, { sections: [], lines: [{ display: "Levadura fresca", section: null }] }))
      .toEqual(["#1 «Levadura fresca»: no measure and no note flagging it"]);
  });
});
