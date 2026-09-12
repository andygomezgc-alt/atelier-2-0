import { describe, expect, it } from "vitest";
import { recipeConversationText } from "../recipe-conversation";
const base = "# Risotto\n## Ingredientes\n200 g arroz\n## Preparación\nCocer el arroz.";
describe("saving recipes developed in conversation", () => {
  it("retains the base recipe plus subsequent requests and refinements", () => {
    const text = recipeConversationText([{ role: "assistant", content: base }, { role: "user", content: "Para cuatro y sin mantequilla" }, { role: "assistant", content: "Usa aceite de oliva y duplica las cantidades." }]);
    expect(text).toContain("200 g arroz");
    expect(text).toContain("Para cuatro");
    expect(text).toContain("aceite de oliva");
  });
  it("uses the latest complete recipe as the base to bound extraction cost", () => {
    const text = recipeConversationText([{ role: "assistant", content: "x".repeat(30000) }, { role: "user", content: "Ahora risotto" }, { role: "assistant", content: base }]);
    expect(text).toContain(base);
    expect(text.length).toBeLessThan(300);
  });
  it("keeps all turns when recipe headings are absent", () => {
    expect(recipeConversationText([{ role: "assistant", content: "200 g arroz" }, { role: "assistant", content: "Cocerlo" }])).toContain("200 g arroz");
  });
  it("refuses oversized context instead of silently dropping the start or refinements", () => {
    expect(() => recipeConversationText([{ role: "assistant", content: base }, { role: "user", content: "x".repeat(30000) }])).toThrow("recipe_context_too_long");
  });
});
