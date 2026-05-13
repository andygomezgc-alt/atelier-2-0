// Small in-memory hand-off so the upload + edit screens can pre-fill the
// recipe form without stuffing 50 ingredients into URL params (and hitting
// the platform's ~2KB query-string ceiling on Android).
//
// One-shot: writer sets it, reader consumes it (which clears it). If the user
// navigates away from /recetas/nueva without saving, the next blank visit
// starts empty.
//
// `editId` distinguishes the two uses: upload extraction sets it to null
// (creates a new recipe), the "Modificar" button on the detail screen sets
// it to the recipe id (PATCHes in place).

import type { CreateRecipeRequest } from "@atelier/shared";

export type RecipeDraft = CreateRecipeRequest & { editId?: string };

let pending: RecipeDraft | null = null;

export function setRecipeDraft(draft: RecipeDraft): void {
  pending = draft;
}

export function consumeRecipeDraft(): RecipeDraft | null {
  const d = pending;
  pending = null;
  return d;
}
