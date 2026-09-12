import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { storage.set(key, value); },
  removeItem: async (key: string) => { storage.delete(key); },
} }));
import { recipeDraftKey, loadRecipeDraft, saveRecipeDraft, clearRecipeDraft, type RecipeEditorDraft } from "../recipe-autosave";
const draft: RecipeEditorDraft = {
  title: "Mi receta", notes: "sin terminar", portionsText: "2,", method: ["Paso 1", ""], editId: null,
  sourceConversationId: "conversation", ingredients: [{ rawText: "2 piezas", productId: "fish", qty: 2, unit: "unidad", pesoCalculoG: 450, mermaOverridePct: 12 }],
};
const key = recipeDraftKey({ userId: "chef", restaurantId: "restaurant" }, null);
describe("durable recipe drafts", () => {
  it("restores the exact outstanding request and its identifier after an uncertain save", async () => {
    const pending = { ...draft, clientRequestId: "save-attempt", saveFingerprint: "form-state",
      saveRequest: { clientRequestId: "save-attempt", title: "Mi receta", contentJson: { ingredients: ["200 g harina"], method: [], notes: "" }, recipeIngredients: [{ rawText: "200 g harina", createProductDraft: true }] } };
    await saveRecipeDraft(key, pending);
    expect(await loadRecipeDraft(key)).toEqual(pending);
  });
  beforeEach(() => storage.clear());
  it("restores unfinished text and structured quantities without normalising them", async () => {
    await saveRecipeDraft(key, draft);
    expect(await loadRecipeDraft(key)).toEqual(draft);
  });
  it("isolates accounts, restaurants and individual recipe edits", async () => {
    await saveRecipeDraft(key, draft);
    for (const other of [recipeDraftKey({ userId: "other", restaurantId: "restaurant" }, null), recipeDraftKey({ userId: "chef", restaurantId: "other" }, null), recipeDraftKey({ userId: "chef", restaurantId: "restaurant" }, "existing")]) {
      expect(await loadRecipeDraft(other)).toBeNull();
    }
  });
  it("clears after all pending writes, without resurrecting the saved recipe", async () => {
    const first = saveRecipeDraft(key, draft);
    const second = saveRecipeDraft(key, { ...draft, title: "latest" });
    await clearRecipeDraft(key);
    await Promise.all([first, second]);
    expect(await loadRecipeDraft(key)).toBeNull();
  });
  it("reports corrupt storage instead of treating it as an empty draft", async () => {
    storage.set(key, "broken");
    await expect(loadRecipeDraft(key)).rejects.toThrow();
    expect(storage.get(key)).toBe("broken");
  });
});
