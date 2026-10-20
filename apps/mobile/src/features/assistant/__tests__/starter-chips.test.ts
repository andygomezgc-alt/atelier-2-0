// Proposal 3: an empty chat offers creative starters (create and improve recipes); a tap fills
// the composer and never sends. Scaling and allergens live in Recetas, so they are not starters.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { en, es, it as itDict, type TranslationKey } from "@atelier/i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  View: "View",
}));
vi.mock("@/src/theme", () => ({
  colors: new Proxy({}, { get: () => "#000000" }),
  fonts: new Proxy({}, { get: () => "font" }),
  fontSizes: new Proxy({}, { get: () => 12 }),
  radii: new Proxy({}, { get: () => 4 }),
  spacing: new Proxy({}, { get: () => 4 }),
}));
// t() returns its key, so the chips are checked by key.
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { CHAT_STARTER_KEYS, starterDraft } from "../chat-starters";
import { StarterChips } from "../components/StarterChips";

describe("chat starters", () => {
  it("offers only creative tasks, written in each dictionary (not a Spanish fallback)", () => {
    expect(CHAT_STARTER_KEYS).toEqual(["chat_starter_create", "chat_starter_substitute", "chat_starter_optimize"]);
    const dicts: Record<string, Record<string, string>> = { es, it: itDict, en };
    for (const key of [...CHAT_STARTER_KEYS, "chat_starters_label"]) {
      for (const [lang, dict] of Object.entries(dicts)) {
        expect(dict[key]?.trim(), `${lang}:${key}`).toBeTruthy();
      }
      expect(itDict[key as TranslationKey]).not.toBe(es[key as TranslationKey]);
      expect(en[key as TranslationKey]).not.toBe(es[key as TranslationKey]);
    }
  });

  it("turns a starter into a draft ready to complete", () => {
    expect(starterDraft("Crea una receta con:")).toBe("Crea una receta con: ");
    expect(starterDraft("Optimiza químicamente esta receta:  ")).toBe("Optimiza químicamente esta receta: ");
  });

  it("fills the composer with the tapped starter and sends nothing", () => {
    const onPick = vi.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(createElement(StarterChips, { onPick, disabled: false })); });
    const chips = tree.root.findAllByType("Pressable" as never);
    expect(chips).toHaveLength(3);
    act(() => { chips[1]!.props.onPress(); });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(starterDraft(CHAT_STARTER_KEYS[1]!));
  });

  it("ignores taps while the composer is busy", () => {
    const onPick = vi.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(createElement(StarterChips, { onPick, disabled: true })); });
    const chip = tree.root.findAllByType("Pressable" as never)[0]!;
    expect(chip.props.disabled).toBe(true);
    act(() => { chip.props.onPress(); });
    expect(onPick).not.toHaveBeenCalled();
  });
});
