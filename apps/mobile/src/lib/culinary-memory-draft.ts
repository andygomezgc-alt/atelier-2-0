import { MemoryKeySchema, type CulinaryMemoryResponse, type MemoryPreference } from "@atelier/shared";

export function relearnCategory(
  draft: CulinaryMemoryResponse,
  key: MemoryPreference["key"],
): CulinaryMemoryResponse {
  return { ...draft, corrections: draft.corrections.filter(correction => correction.key !== key) };
}

export function memoryPatchBody(data: CulinaryMemoryResponse, draft: CulinaryMemoryResponse) {
  return {
    expectedVersion: data.version,
    enabled: draft.enabled,
    identityLine: draft.identityLine,
    city: draft.city?.trim() || null,
    corrections: draft.corrections,
    excludedKeys: draft.excludedKeys,
  };
}

export function hasUnsavedRelearn(
  saved: CulinaryMemoryResponse | null,
  draft: CulinaryMemoryResponse | null,
): boolean {
  if (!saved || !draft) return false;
  return saved.corrections.some(({ key }) =>
    !draft.corrections.some(correction => correction.key === key) && !draft.excludedKeys.includes(key)
  );
}

type MemoryKey = MemoryPreference["key"];

export const MEMORY_CATEGORY_KEYS = MemoryKeySchema.options;

export type MemoryCategoryState = { state: "declared" | "learned" | "hidden" | "empty"; text: string };

// One state per category: the chef's declaration wins over a hidden or learned category.
export function memoryCategory(draft: CulinaryMemoryResponse, key: MemoryKey): MemoryCategoryState {
  const correction = draft.corrections.find(item => item.key === key);
  if (correction) return { state: "declared", text: correction.text };
  if (draft.excludedKeys.includes(key)) return { state: "hidden", text: "" };
  const learned = draft.learned.find(item => item.key === key);
  return learned ? { state: "learned", text: learned.text } : { state: "empty", text: "" };
}

export function setCorrection(draft: CulinaryMemoryResponse, key: MemoryKey, text: string): CulinaryMemoryResponse {
  return { ...draft, corrections: [...draft.corrections.filter(item => item.key !== key), { key, text }] };
}

export function hideCategory(draft: CulinaryMemoryResponse, key: MemoryKey): CulinaryMemoryResponse {
  return { ...relearnCategory(draft, key), excludedKeys: [...new Set([...draft.excludedKeys, key])] };
}

export function showCategory(draft: CulinaryMemoryResponse, key: MemoryKey): CulinaryMemoryResponse {
  return { ...draft, excludedKeys: draft.excludedKeys.filter(item => item !== key) };
}

const REGISTER_SEPARATOR = " — ";

// Puts the cuisine register at the start of the text, replacing a register already there.
export function applyCuisineRegister(text: string, phrase: string, phrases: readonly string[]): string {
  const current = phrases.find(item => text.startsWith(item));
  const next = current ? phrase + text.slice(current.length)
    : !text.trim() ? phrase + REGISTER_SEPARATOR
    : phrase + REGISTER_SEPARATOR + text;
  return next.slice(0, 160);
}
