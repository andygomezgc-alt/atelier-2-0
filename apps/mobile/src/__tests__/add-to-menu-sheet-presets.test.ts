// The create-section step of the add-to-menu wizard takes its presets from i18n:
// each chef sees them in the app language, in service order, and a tapped preset
// creates the section with that name and adds the recipe to it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { t, type Language } from "@atelier/i18n";

const h = vi.hoisted(() => ({
  listMenus: vi.fn(),
  getMenu: vi.fn(),
  addMenuItem: vi.fn(),
  createSection: vi.fn(),
  showToast: vi.fn(),
  onClose: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
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
vi.mock("@/src/components/Toast", () => ({ showToast: h.showToast }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "error" }));
vi.mock("@/src/api/menus", () => ({
  listMenus: h.listMenus,
  getMenu: h.getMenu,
  createMenu: vi.fn(),
  addMenuItem: h.addMenuItem,
  createSection: h.createSection,
}));

import { setLang } from "@/src/hooks/useI18n";
import { AddToMenuSheet } from "../components/AddToMenuSheet";

const RECIPE_ID = "recipe-1";
const MENU_ID = "menu-autumn";
const NEW_SECTION_ID = "section-new";

// A menu that already has two sections, ordered by `order` as the API returns them.
const MENU = {
  id: MENU_ID,
  name: "Carta de otoño",
  season: "Otoño",
  inService: true,
  sections: [
    { id: "section-snacks", name: "Para picar", order: 0 },
    { id: "section-grill", name: "Brasa", order: 1 },
  ],
  items: [],
};

// The same menu, but it already has a "Postres" section: the new one repeats its name.
const MENU_WITH_POSTRES = {
  ...MENU,
  sections: [
    { id: "section-old", name: "Postres", order: 0 },
    { id: "section-grill", name: "Brasa", order: 1 },
  ],
};

// Like POST /api/menus/[id]/sections: the new section goes last (order = max + 1)
// and the whole menu comes back with its sections ordered by `order`.
const serverCreateSection = (menu: typeof MENU) => async (_menuId: string, data: { name: string }) => ({
  ...menu,
  sections: [
    ...menu.sections,
    { id: NEW_SECTION_ID, name: data.name, order: Math.max(...menu.sections.map((section) => section.order)) + 1 },
  ],
});

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
const textOf = (text: ReactTestInstance) => [text.props.children].flat().join("");
// At the create-section step the preset chips are the only pressables with a text label:
// the back arrow and the custom-name button only hold icons.
const chips = () =>
  screen.root
    .findAllByType("Pressable" as never)
    .filter((node) => node.findAllByType("Text" as never).length > 0);
const label = (chip: ReactTestInstance) => textOf(chip.findByType("Text" as never));

async function press(text: string) {
  const target = screen.root
    .findAllByType("Pressable" as never)
    .find((node) => node.findAllByType("Text" as never).some((child) => textOf(child) === text));
  if (!target) throw new Error(`No pressable labelled "${text}"`);
  await act(async () => {
    target.props.onPress();
  });
}

// The custom-name button is the only pressable at this step that holds the "add" icon.
function customAddButton() {
  const button = screen.root
    .findAllByType("Pressable" as never)
    .find((node) => node.findAllByType("Ionicons" as never).some((icon) => icon.props.name === "add"));
  if (!button) throw new Error("No custom-name add button");
  return button;
}

// The path a chef takes: open the sheet, pick the menu, tap "add section".
async function openCreateSectionStep(lang: Language) {
  setLang(lang);
  await act(async () => {
    screen = create(createElement(AddToMenuSheet, { open: true, recipeId: RECIPE_ID, onClose: h.onClose }));
  });
  await press(MENU.name);
  await press(t("section_add", lang));
  // Only the create-section step has the custom-name input.
  expect(screen.root.findAllByType("TextInput" as never)).toHaveLength(1);
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  h.listMenus.mockResolvedValue([
    { id: MENU_ID, name: MENU.name, season: MENU.season, itemCount: 0, updatedAt: "2026-10-01T10:00:00.000Z", inService: true },
  ]);
  h.getMenu.mockResolvedValue(MENU);
  h.addMenuItem.mockResolvedValue(MENU);
  h.createSection.mockImplementation(serverCreateSection(MENU));
});

afterEach(async () => {
  if (screen) await act(async () => { screen.unmount(); });
  setLang("es");
});

describe("AddToMenuSheet create-section presets", () => {
  it.each(["es", "it", "en"] as const)("lists the nine presets in the app language (%s), in service order", async (lang) => {
    await openCreateSectionStep(lang);
    expect(chips().map(label)).toEqual(PRESETS[lang]);
  });

  it("creates the section with the translated name of the tapped preset and adds the recipe to it", async () => {
    await openCreateSectionStep("es");
    await act(async () => {
      chips()[2]!.props.onPress();
    });
    expect(h.createSection).toHaveBeenCalledTimes(1);
    expect(h.createSection).toHaveBeenCalledWith(MENU_ID, { name: "Primeros platos" });
    expect(h.addMenuItem).toHaveBeenCalledTimes(1);
    expect(h.addMenuItem).toHaveBeenCalledWith(
      MENU_ID,
      expect.objectContaining({ recipeId: RECIPE_ID, sectionId: NEW_SECTION_ID }),
    );
  });
});

describe("AddToMenuSheet create-section", () => {
  it("adds the recipe to the new section even when the menu already has one with the same name", async () => {
    h.getMenu.mockResolvedValue(MENU_WITH_POSTRES);
    h.createSection.mockImplementation(serverCreateSection(MENU_WITH_POSTRES));
    await openCreateSectionStep("es");
    // The custom-name path, so this case does not depend on the preset translation.
    await act(async () => {
      screen.root.findByType("TextInput" as never).props.onChangeText("Postres");
    });
    // A chef can only press the button once there is a name to add.
    expect(customAddButton().props.disabled).toBe(false);
    await act(async () => {
      customAddButton().props.onPress();
    });
    expect(h.createSection).toHaveBeenCalledTimes(1);
    expect(h.createSection).toHaveBeenCalledWith(MENU_ID, { name: "Postres" });
    expect(h.addMenuItem).toHaveBeenCalledTimes(1);
    expect(h.addMenuItem).toHaveBeenCalledWith(
      MENU_ID,
      expect.objectContaining({ recipeId: RECIPE_ID, sectionId: NEW_SECTION_ID }),
    );
  });

  it("lets the chef add the recipe to a new section again after closing and reopening the sheet", async () => {
    await openCreateSectionStep("es");
    await act(async () => {
      chips()[2]!.props.onPress();
    });
    expect(h.createSection).toHaveBeenCalledTimes(1);
    expect(h.addMenuItem).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);

    // The recipe screen keeps the sheet mounted and only toggles `open`.
    const sheet = (open: boolean) => createElement(AddToMenuSheet, { open, recipeId: RECIPE_ID, onClose: h.onClose });
    await act(async () => {
      screen.update(sheet(false));
    });
    await act(async () => {
      screen.update(sheet(true));
    });
    await press(MENU.name);
    await press(t("section_add", "es"));
    expect(screen.root.findAllByType("TextInput" as never)).toHaveLength(1);

    expect(chips().map((chip) => chip.props.disabled)).toEqual(Array(9).fill(false));
    await act(async () => {
      screen.root.findByType("TextInput" as never).props.onChangeText("Sugerencias");
    });
    expect(customAddButton().props.disabled).toBe(false);

    await act(async () => {
      chips()[7]!.props.onPress();
    });
    expect(h.createSection).toHaveBeenCalledTimes(2);
    expect(h.createSection).toHaveBeenLastCalledWith(MENU_ID, { name: "Postres" });
    expect(h.addMenuItem).toHaveBeenCalledTimes(2);
    expect(h.addMenuItem).toHaveBeenLastCalledWith(
      MENU_ID,
      expect.objectContaining({ recipeId: RECIPE_ID, sectionId: NEW_SECTION_ID }),
    );
  });
});
