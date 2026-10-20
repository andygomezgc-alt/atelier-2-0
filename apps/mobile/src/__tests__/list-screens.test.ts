// Recipes, Menus and Products list screens.
// Proposal 5: they load with ghost cards, and an empty list offers to create the first one
// through the same lazy restaurant creation as the header buttons.
// Proposal 1: the recipe card shows its food cost chip and the in-service menu card its cost line.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  ensureRestaurant: vi.fn(),
  listRecipes: vi.fn(),
  listMenus: vi.fn(),
  listProducts: vi.fn(),
  role: "admin" as string,
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", FlatList: "FlatList", Pressable: "Pressable", RefreshControl: "RefreshControl",
  ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useRouter: () => ({ push: h.push, back: vi.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (fn: () => void) => useEffect(fn, [fn]),
  };
});
vi.mock("@/src/theme", () => ({
  // Each colour resolves to its token name, so the food cost tone can be asserted.
  colors: new Proxy({}, { get: (_target, key) => String(key) }),
  fonts: new Proxy({}, { get: () => "font" }),
  fontSizes: new Proxy({}, { get: () => 12 }),
  radii: new Proxy({}, { get: () => 4 }),
  spacing: new Proxy({}, { get: () => 4 }),
}));
// A stable t, like the real hook: the screens reload when t changes. Variables are appended.
const i18n = vi.hoisted(() => ({
  lang: "es",
  t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => i18n }));
vi.mock("@/src/hooks/useAuth", () => ({
  useAuth: () => ({ state: { status: "signed-in", user: { role: h.role, restaurantId: "r1" } } }),
}));
vi.mock("@/src/hooks/useRefresh", () => ({ useRefresh: () => ({ refreshing: false, onRefresh: vi.fn() }) }));
vi.mock("@/src/components/Screen", () => ({ Screen: "Screen" }));
vi.mock("@/src/components/Empty", () => ({ Empty: "Empty" }));
vi.mock("@/src/components/SkeletonList", () => ({ SkeletonList: "SkeletonList" }));
vi.mock("@/src/components/NetworkError", () => ({ NetworkError: "NetworkError" }));
vi.mock("@/src/components/ConfirmSheet", () => ({ ConfirmSheet: "ConfirmSheet" }));
vi.mock("@/src/components/SectionExplainer", () => ({ SectionExplainer: "SectionExplainer" }));
vi.mock("@/src/components/NewMenuSheet", () => ({ NewMenuSheet: "NewMenuSheet" }));
vi.mock("@/src/components/ExportPreviewSheet", () => ({ ExportPreviewSheet: "ExportPreviewSheet" }));
vi.mock("@/src/components/Toast", () => ({ showToast: vi.fn() }));
vi.mock("@/src/components/LazyRestaurantHost", () => ({ ensureRestaurant: h.ensureRestaurant }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "error" }));
vi.mock("@/src/lib/export-file", () => ({ downloadAndShare: vi.fn(), sanitizeFilename: (s: string) => s }));
vi.mock("@/src/api/recipes", () => ({ listRecipes: h.listRecipes, deleteRecipe: vi.fn() }));
vi.mock("@/src/api/products", () => ({ listProducts: h.listProducts, patchProduct: vi.fn() }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("@/src/components/CategoryIcon", () => ({ CategoryIcon: "CategoryIcon" }));
vi.mock("@/src/components/EditableCell", () => ({ EditableCell: "EditableCell" }));
vi.mock("@/src/components/PriceChangeBadge", () => ({ PriceChangeBadge: "PriceChangeBadge" }));
vi.mock("@/src/lib/keyboard", () => ({ useKeyboardHeight: () => 0 }));
vi.mock("@/src/api/menus", () => ({ listMenus: h.listMenus, createMenu: vi.fn(), deleteMenu: vi.fn(), getMenu: vi.fn() }));

import RecetasScreen from "../../app/(tabs)/recetas";
import MenusScreen from "../../app/(tabs)/menus";
import ProductosScreen from "../../app/productos/index";

let screen: ReactTestRenderer;
async function render(component: () => ReactElement | null) {
  await act(async () => { screen = create(createElement(component)); });
}
// FlatList is a host string here, so its empty slot is read from the prop.
const emptySlot = () => screen.root.findByType("FlatList" as never).props.ListEmptyComponent as ReactElement<Record<string, unknown>>;
const pending = () => new Promise<never>(() => {});

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.role = "admin";
  h.ensureRestaurant.mockResolvedValue(undefined);
  h.listRecipes.mockResolvedValue([]);
  h.listMenus.mockResolvedValue([]);
  h.listProducts.mockResolvedValue([]);
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("Recipes list", () => {
  it("shows ghost cards while the first load runs", async () => {
    h.listRecipes.mockImplementation(pending);
    await render(RecetasScreen);
    expect(emptySlot().type).toBe("SkeletonList");
  });

  it("an empty book offers to create the first recipe, after the lazy restaurant step", async () => {
    await render(RecetasScreen);
    const empty = emptySlot();
    expect(empty.type).toBe("Empty");
    expect(empty.props.actionLabel).toBe("empty_recetas_cta");
    await act(async () => { await (empty.props.onAction as () => Promise<void>)(); });
    expect(h.ensureRestaurant).toHaveBeenCalledOnce();
    expect(h.push).toHaveBeenCalledWith("/recetas/nueva");
  });

  it("does not open the editor when the restaurant step is cancelled", async () => {
    h.ensureRestaurant.mockRejectedValue(new Error("cancelled"));
    await render(RecetasScreen);
    await act(async () => { await (emptySlot().props.onAction as () => Promise<void>)(); });
    expect(h.push).not.toHaveBeenCalled();
  });

  it("a role that cannot write recipes gets no create action", async () => {
    h.role = "viewer";
    await render(RecetasScreen);
    expect(emptySlot().props.actionLabel).toBeUndefined();
    expect(emptySlot().props.onAction).toBeUndefined();
  });

  it("the header create button still goes through the restaurant step to the editor", async () => {
    await render(RecetasScreen);
    const button = screen.root.findAllByType("Pressable" as never).find((p) =>
      p.findAllByType("Text" as never).some((t) => t.children.join("") === "btn_crear_receta"),
    )!;
    await act(async () => { await button.props.onPress(); });
    expect(h.ensureRestaurant).toHaveBeenCalledOnce();
    expect(h.push).toHaveBeenCalledWith("/recetas/nueva");
  });
});

describe("Menus list", () => {
  it("shows ghost cards while the first load runs", async () => {
    h.listMenus.mockImplementation(pending);
    await render(MenusScreen);
    expect(emptySlot().type).toBe("SkeletonList");
  });

  it("an empty list offers to create the first menu with the new-menu sheet", async () => {
    await render(MenusScreen);
    const empty = emptySlot();
    expect(empty.type).toBe("Empty");
    expect(empty.props.actionLabel).toBe("empty_menus_cta");
    expect(screen.root.findByType("NewMenuSheet" as never).props.open).toBe(false);
    await act(async () => { (empty.props.onAction as () => void)(); });
    expect(screen.root.findByType("NewMenuSheet" as never).props.open).toBe(true);
  });

  it("a role that cannot create menus gets no create action", async () => {
    h.role = "sous_chef";
    await render(MenusScreen);
    expect(emptySlot().props.actionLabel).toBeUndefined();
    expect(emptySlot().props.onAction).toBeUndefined();
  });
});

describe("Recipe card food cost", () => {
  const recipe = (foodCostPct: number | null, priority = false) => ({
    id: "r1", title: "Tarta de queso", state: "approved", priority, version: 1, authorName: "Chef",
    updatedAt: "2026-10-19T10:00:00Z", perPortionCents: 250, costStatus: "complete", foodCostPct,
    salePrice: 900, portions: 8, allergens: [], unlinkedIngredients: 0,
  });
  let card: ReactTestRenderer | null = null;
  async function renderCard(foodCostPct: number | null, priority = false) {
    await render(RecetasScreen);
    const renderItem = screen.root.findByType("FlatList" as never).props.renderItem as (row: { item: unknown }) => ReactElement;
    await act(async () => { card = create(renderItem({ item: recipe(foodCostPct, priority) })); });
    return card!;
  }
  const chip = (c: ReactTestRenderer) =>
    c.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("cost_card_food_cost"));
  const borderOf = (c: ReactTestRenderer) => (chip(c)[0]!.props.style as Array<{ borderColor?: string }>).find((s) => s?.borderColor)?.borderColor;
  const cardTexts = (c: ReactTestRenderer) => c.root.findAllByType("Text" as never).map((n) => n.children.join(""));
  afterEach(async () => { if (card) { const c = card; card = null; await act(async () => { c.unmount(); }); } });

  it("shows the food cost with its value, tone colour and spoken label", async () => {
    const c = await renderCard(33);
    expect(chip(c)).toHaveLength(1);
    expect(chip(c)[0]!.props.accessibilityLabel).toBe('cost_card_food_cost:{"n":33}');
    expect(borderOf(c)).toBe("amber");
    expect(cardTexts(c)).toContain('recetas_card_food_cost:{"n":33}');
  });

  it("uses green within target and dark terracota above the limit", async () => {
    expect(borderOf(await renderCard(28))).toBe("green");
    await act(async () => { card!.unmount(); screen.unmount(); });
    card = null;
    expect(borderOf(await renderCard(41))).toBe("danger");
  });

  it("marks a priority recipe with a single star and a spoken label", async () => {
    const c = await renderCard(33, true);
    expect(c.root.findAll((n) => n.type === ("Ionicons" as never) && n.props.name === "star")).toHaveLength(1);
    expect(cardTexts(c).some((t) => t.includes("★"))).toBe(false);
    expect(c.root.findAllByProps({ accessibilityLabel: "recetas_card_priority" }).length).toBeGreaterThan(0);
  });

  it("shows no chip when the food cost is unknown", async () => {
    const c = await renderCard(null);
    expect(chip(c)).toHaveLength(0);
    expect(cardTexts(c).some((t) => t.startsWith("recetas_card_food_cost"))).toBe(false);
  });
});

describe("In-service menu cost line", () => {
  const menu = (costSummary?: object | null) => ({
    id: "m1", name: "Carta de otoño", season: null, itemCount: 3, updatedAt: "2026-10-19T10:00:00Z", inService: true,
    ...(costSummary === undefined ? {} : { costSummary }),
  });
  // The in-service cards live in the FlatList header element, rendered on its own here.
  const texts = () => {
    const element = screen.root.findByType("FlatList" as never).props.ListHeaderComponent as ReactElement;
    let header!: ReactTestRenderer;
    act(() => { header = create(element); });
    const found = header.root.findAllByType("Text" as never).map((n) => n.children.join(""));
    act(() => { header.unmount(); });
    return found;
  };

  it("shows the average dish cost and margin", async () => {
    h.listMenus.mockResolvedValue([menu({ avgDishCostCents: 320, marginPct: 72, pricedDishes: 3, totalDishes: 3 })]);
    await render(MenusScreen);
    expect(texts()).toContain('menu_cost_line:{"cost":"3,20 €","margin":72}');
  });

  it("says which dishes the numbers come from when some are not costed", async () => {
    h.listMenus.mockResolvedValue([menu({ avgDishCostCents: 320, marginPct: 72, pricedDishes: 2, totalDishes: 3 })]);
    await render(MenusScreen);
    expect(texts()).toContain('menu_cost_line:{"cost":"3,20 €","margin":72} · menu_cost_coverage:{"priced":2,"total":3}');
  });

  it("shows no cost line without a summary", async () => {
    for (const summary of [null, undefined]) {
      h.listMenus.mockResolvedValue([menu(summary)]);
      await render(MenusScreen);
      expect(texts()).toContain("Carta de otoño");
      expect(texts().some((t) => t.startsWith("menu_cost_line"))).toBe(false);
      await act(async () => { screen.unmount(); });
    }
  });
});

describe("Loading when a list opens", () => {
  const pressFilter = (label: string) => screen.root.findAllByProps({ children: label })[0].parent!.props.onPress();

  it("the recipe book asks for its list once, and again when the filter changes", async () => {
    await render(RecetasScreen);
    expect(h.listRecipes).toHaveBeenCalledTimes(1);
    await act(async () => { pressFilter("recetas_filter_approved"); });
    expect(h.listRecipes).toHaveBeenCalledTimes(2);
  });

  it("the product bank asks for its list once, and again when the filter changes", async () => {
    await render(ProductosScreen);
    expect(h.listProducts).toHaveBeenCalledTimes(1);
    await act(async () => { pressFilter("category_pescado"); });
    expect(h.listProducts).toHaveBeenCalledTimes(2);
  });
});
