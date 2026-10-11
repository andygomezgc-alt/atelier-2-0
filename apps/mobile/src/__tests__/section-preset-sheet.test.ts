// The section presets come from i18n: each chef sees them in the app language,
// in service order, and a tapped preset creates the section with that name.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import type { Language } from "@atelier/i18n";

const h = vi.hoisted(() => ({ onPick: vi.fn(), onClose: vi.fn() }));

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));

import { setLang } from "@/src/hooks/useI18n";
import { SectionPresetSheet } from "../components/SectionPresetSheet";

const PRESETS: Record<Language, string[]> = {
  es: [
    "Entradas frías",
    "Entradas calientes",
    "Primeros platos",
    "Principales de mar",
    "Principales de tierra",
    "Guarniciones",
    "Prepostre",
    "Postres",
    "Petits fours",
  ],
  it: [
    "Antipasti freddi",
    "Antipasti caldi",
    "Primi piatti",
    "Secondi di mare",
    "Secondi di terra",
    "Contorni",
    "Pre-dessert",
    "Dolci",
    "Piccola pasticceria",
  ],
  en: [
    "Cold starters",
    "Hot starters",
    "First courses",
    "Seafood mains",
    "Meat mains",
    "Sides",
    "Pre-dessert",
    "Desserts",
    "Petits fours",
  ],
};

let screen: ReactTestRenderer;
// Preset chips are the pressables with a text label; the custom-name button only has an icon.
const chips = () =>
  screen.root
    .findAllByType("Pressable" as never)
    .filter((node) => node.findAllByType("Text" as never).length > 0);
const label = (chip: ReactTestInstance) =>
  [chip.findByType("Text" as never).props.children].flat().join("");

async function render(lang: Language) {
  setLang(lang);
  await act(async () => {
    screen = create(createElement(SectionPresetSheet, { open: true, onClose: h.onClose, onPick: h.onPick }));
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
});

afterEach(async () => {
  if (screen) await act(async () => { screen.unmount(); });
  setLang("es");
});

describe("SectionPresetSheet presets", () => {
  it.each(["es", "it", "en"] as const)("lists the nine presets in the app language (%s), in service order", async (lang) => {
    await render(lang);
    expect(chips().map(label)).toEqual(PRESETS[lang]);
  });

  it("creates the section with the translated name of the tapped preset", async () => {
    await render("es");
    await act(async () => {
      chips()[2]!.props.onPress();
    });
    expect(h.onPick).toHaveBeenCalledTimes(1);
    expect(h.onPick).toHaveBeenCalledWith("Primeros platos");
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
