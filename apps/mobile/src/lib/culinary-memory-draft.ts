import type { CulinaryMemoryResponse, MemoryPreference } from "@atelier/shared";

export function relearnCategory(
  draft: CulinaryMemoryResponse,
  key: MemoryPreference["key"],
): CulinaryMemoryResponse {
  return { ...draft, corrections: draft.corrections.filter(correction => correction.key !== key) };
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
