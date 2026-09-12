import AsyncStorage from "@react-native-async-storage/async-storage";
import type { IngredientValue } from "./recipe-editor";
import type { CreateRecipeRequest } from "@atelier/shared";

export type RecipeEditorDraft = {
  clientRequestId?: string;
  saveRequest?: CreateRecipeRequest;
  saveFingerprint?: string;
  title: string;
  ingredients: IngredientValue[];
  method: string[];
  notes: string;
  portionsText: string;
  editId: string | null;
  sourceConversationId: string | null;
};

export function recipeDraftKey(identity: { userId: string; restaurantId: string }, editId: string | null): string {
  return `atelier.recipe_draft.v1.${encodeURIComponent(identity.userId)}.${encodeURIComponent(identity.restaurantId)}.${encodeURIComponent(editId ?? "new")}`;
}

// Serialise reads, writes and removal so a late write cannot resurrect a saved draft.
const operations = new Map<string, Promise<unknown>>();
function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const next = (operations.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
  operations.set(key, next);
  void next.finally(() => {
    if (operations.get(key) === next) operations.delete(key);
  }).catch(() => undefined);
  return next;
}

export function loadRecipeDraft(key: string): Promise<RecipeEditorDraft | null> {
  return serial(key, async () => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as RecipeEditorDraft;
    if (typeof draft.title !== "string" || typeof draft.notes !== "string" || typeof draft.portionsText !== "string"
      || !Array.isArray(draft.ingredients) || !draft.ingredients.every(i => typeof i.rawText === "string")
      || !Array.isArray(draft.method) || !draft.method.every(m => typeof m === "string")
      || !(draft.editId === null || typeof draft.editId === "string")
      || !(draft.sourceConversationId === null || typeof draft.sourceConversationId === "string")) {
      throw new Error("Invalid recipe draft");
    }
    return draft;
  });
}

export function saveRecipeDraft(key: string, draft: RecipeEditorDraft): Promise<void> {
  const snapshot = JSON.stringify(draft);
  return serial(key, () => AsyncStorage.setItem(key, snapshot));
}

export function clearRecipeDraft(key: string): Promise<void> {
  return serial(key, () => AsyncStorage.removeItem(key));
}
