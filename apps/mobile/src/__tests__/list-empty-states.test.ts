// Proposal 5: Recipes and Menus load with ghost cards, and an empty list offers to create the
// first one through the same lazy restaurant creation as the header buttons.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  ensureRestaurant: vi.fn(),
  listRecipes: vi.fn(),
  listMenus: vi.fn(),
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
  return { useRouter: () => ({ push: h.push, back: vi.fn() }), useFocusEffect: (fn: () => void) => useEffect(fn, [fn]) };
});
vi.mock("@/src/theme", () => ({
  colors: new Proxy({}, { get: () => "#000000" }),
  fonts: new Proxy({}, { get: () => "font" }),
  fontSizes: new Proxy({}, { get: () => 12 }),
  radii: new Proxy({}, { get: () => 4 }),
  spacing: new Proxy({}, { get: () => 4 }),
}));
// A stable t, like the real hook: the screens reload when t changes.
const i18n = vi.hoisted(() => ({ lang: "es", t: (key: string) => key }));
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
vi.mock("@/src/api/menus", () => ({ listMenus: h.listMenus, createMenu: vi.fn(), deleteMenu: vi.fn(), getMenu: vi.fn() }));

import RecetasScreen from "../../app/(tabs)/recetas";
import MenusScreen from "../../app/(tabs)/menus";

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
