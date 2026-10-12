// The recipe detail lists each ingredient with its cost or the reason it has
// none; without cost lines (older API) it keeps the plain legacy list.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import type { RecipeCostLine, RecipeIngredientResponse } from "@atelier/shared";

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "es", languageTag: "es-ES" }],
}));

import { setLang } from "@/src/hooks/useI18n";
import { RecipeIngredientList } from "../components/RecipeIngredientList";

function ingredient(id: string, position: number, rawText: string): RecipeIngredientResponse {
  return {
    id,
    position,
    rawText,
    qty: null,
    unit: null,
    pezzatura: null,
    mermaOverridePct: null,
    pesoCalculoG: null,
    pezzaturaWarning: null,
    product: null,
  };
}

const INGREDIENTS = [
  ingredient("a", 0, "40 g aceite de oliva"),
  ingredient("b", 1, "2 huevos"),
  ingredient("c", 2, "1 limón"),
];
const TEXTS = INGREDIENTS.map((i) => i.rawText);
const LINES: RecipeCostLine[] = [
  { ingredientId: "a", position: 0, status: "needs_density", costCents: null, productId: "p-oil", recipeUnit: "g", purchaseUnit: "l" },
  { ingredientId: "b", position: 1, status: "ok", costCents: 120, productId: "p-egg", recipeUnit: "unidad", purchaseUnit: "unidad" },
  { ingredientId: "c", position: 2, status: "incompatible_unit", costCents: null, productId: "p-lemon", recipeUnit: "unidad", purchaseUnit: "l" },
];
const ALL = { canManageProducts: true, canEditRecipe: true };

let screen: ReactTestRenderer;
const onLinePress = vi.fn();

const textOf = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
const texts = () => screen.root.findAllByType("Text" as never).map(textOf);
const pressables = () => screen.root.findAllByType("Pressable" as never);

async function render(props: Partial<Parameters<typeof RecipeIngredientList>[0]>) {
  await act(async () => {
    screen = create(
      createElement(RecipeIngredientList, {
        ingredients: TEXTS,
        recipeIngredients: INGREDIENTS,
        permissions: ALL,
        onLinePress,
        ...props,
      }),
    );
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  setLang("es");
});

afterEach(async () => {
  if (screen) await act(async () => { screen.unmount(); });
});

describe("RecipeIngredientList", () => {
  it("renders the legacy list, without reasons or taps, when there are no cost lines", async () => {
    await render({ lines: undefined });
    expect(texts()).toEqual(["Ingredientes", "· 40 g aceite de oliva", "· 2 huevos", "· 1 limón"]);
    expect(pressables()).toHaveLength(0);
  });

  it("renders nothing without ingredients or lines", async () => {
    await render({ ingredients: [], recipeIngredients: [], lines: undefined });
    expect(screen.toJSON()).toBeNull();
  });

  it("shows the cost of priced ingredients and the reason of the others", async () => {
    await render({ lines: LINES });
    const all = texts();
    expect(all).toContain("1,20 €");
    expect(all).toContain("Falta cuánto pesa 1 litro");
    expect(all).toContain("La receta usa unidad y el producto se compra por l");
    expect(all).toContain("· 2 huevos");
  });

  it("lets a chef who can edit products tap only the ingredients that need a fix", async () => {
    await render({ lines: LINES });
    expect(pressables()).toHaveLength(2);
    await act(async () => {
      pressables()[1]!.props.onPress();
    });
    expect(onLinePress).toHaveBeenCalledTimes(1);
    expect(onLinePress.mock.calls[0]![0]).toMatchObject({ text: "1 limón", line: { status: "incompatible_unit" } });
  });

  it("shows the reasons but no taps to someone who cannot edit products", async () => {
    await render({ lines: LINES, permissions: { canManageProducts: false, canEditRecipe: false } });
    expect(texts()).toContain("Falta cuánto pesa 1 litro");
    expect(pressables()).toHaveLength(0);
  });
});
