// Actual memory sheet: the «Cómo cocinamos» categories, with network and native layers replaced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  getCulinaryMemory: vi.fn(), patchCulinaryMemory: vi.fn(), getChefNotes: vi.fn(), toast: vi.fn(), onClose: vi.fn(),
  t: (key: string) => key,
}));
vi.mock("react-native", () => ({
  Pressable: "Pressable", ScrollView: "ScrollView", Switch: "Switch", Text: "Text", TextInput: "TextInput", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock("@/src/api/client", () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock("@/src/api/culinary-memory", () => ({ getCulinaryMemory: h.getCulinaryMemory, patchCulinaryMemory: h.patchCulinaryMemory, clearCulinaryMemory: vi.fn() }));
vi.mock("@/src/api/chef-notes", () => ({ getChefNotes: h.getChefNotes, deleteChefNote: vi.fn() }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("@/src/components/ConfirmSheet", () => ({ ConfirmSheet: "ConfirmSheet" }));
vi.mock("@/src/components/Button", () => ({ Button: "Button" }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: (e: Error) => `translated:${e.message}` }));

import { CulinaryMemorySheet } from "../components/CulinaryMemorySheet";
let screen: ReactTestRenderer;
const empty = {
  restaurantId: "restaurant-1", version: 4, enabled: true, identityLine: null, city: null, learned: [], corrections: [],
  excludedKeys: [], updatedAt: null, canEdit: true, learningAvailable: true,
};
const keys = ["cuisine", "ingredients", "techniques", "flavours", "textures", "presentation", "complexity"];
const texts = () => screen.root.findAllByType("Text" as never).map((node) => [node.props.children].flat().join(""));
const action = (label: string) => screen.root.findAll((node) => node.type === ("Pressable" as never) && node.props.accessibilityLabel === label);
const press = async (label: string) => { await act(async () => { action(label)[0]!.props.onPress(); }); };
const input = () => screen.root.findAllByType("TextInput" as never).find((node) => node.props.accessibilityLabel?.startsWith("memory_edit"));
const saveButton = () => screen.root.findAllByType("Button" as never).find((node) => node.props.label === "memory_save")!;
async function render(memory: object) {
  h.getCulinaryMemory.mockResolvedValue(memory);
  await act(async () => { screen = create(createElement(CulinaryMemorySheet, { restaurantId: "restaurant-1", onClose: h.onClose })); });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  h.getChefNotes.mockResolvedValue({ notes: [], canEdit: true });
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("«Cómo cocinamos» categories", () => {
  it("shows the seven labelled categories in order, each offering to declare, with an empty memory", async () => {
    await render(empty);
    expect(texts()).toContain("memory_learned");
    const labels = texts().filter((text) => text.startsWith("memory_cat_"));
    expect(labels).toEqual(keys.map((key) => `memory_cat_${key}`));
    for (const key of keys) expect(action(`memory_declare: memory_cat_${key}`)).toHaveLength(1);
    expect(screen.root.findAllByType("Button" as never).some((node) => node.props.label === "memory_restore")).toBe(false);
  });

  it("shows each category in one state with its own actions", async () => {
    await render({
      ...empty,
      learned: [{ key: "flavours", text: "Acidez marcada" }, { key: "cuisine", text: "Aprendida" }, { key: "textures", text: "Crujiente" }],
      corrections: [{ key: "cuisine", text: "Cocina de mercado" }],
      excludedKeys: ["textures"],
    });
    expect(texts()).toEqual(expect.arrayContaining(["Cocina de mercado", "memory_tag_declared", "Acidez marcada", "memory_tag_learned", "memory_hidden"]));
    expect(texts()).not.toContain("Aprendida");
    expect(texts()).not.toContain("Crujiente");
    expect(action("memory_edit: memory_cat_cuisine")).toHaveLength(1);
    expect(action("memory_relearn: memory_cat_cuisine")).toHaveLength(1);
    expect(action("memory_hide: memory_cat_cuisine")).toHaveLength(0);
    expect(action("memory_declare: memory_cat_cuisine")).toHaveLength(0);
    expect(action("memory_edit: memory_cat_flavours")).toHaveLength(1);
    expect(action("memory_hide: memory_cat_flavours")).toHaveLength(1);
    expect(action("memory_relearn: memory_cat_flavours")).toHaveLength(0);
    expect(action("memory_show: memory_cat_textures")).toHaveLength(1);
    expect(action("memory_edit: memory_cat_textures")).toHaveLength(0);
    expect(action("memory_declare: memory_cat_complexity")).toHaveLength(1);
  });

  it("turns a learned category into a declaration when it is edited", async () => {
    await render({ ...empty, learned: [{ key: "flavours", text: "Acidez marcada" }] });
    await press("memory_edit: memory_cat_flavours");
    await act(async () => { input()!.props.onChangeText("Acidez y amargor"); });
    expect(texts()).toContain("memory_tag_declared");
    expect(action("memory_relearn: memory_cat_flavours")).toHaveLength(1);
  });

  it("hides a learned category and shows back only the one requested", async () => {
    h.patchCulinaryMemory.mockImplementation(async (body) => ({ ...empty, ...body }));
    await render({ ...empty, learned: [{ key: "flavours", text: "Acidez marcada" }], excludedKeys: ["textures", "presentation"] });
    await press("memory_hide: memory_cat_flavours");
    expect(action("memory_show: memory_cat_flavours")).toHaveLength(1);
    await press("memory_show: memory_cat_textures");
    expect(action("memory_show: memory_cat_textures")).toHaveLength(0);
    expect(action("memory_declare: memory_cat_textures")).toHaveLength(1);
    expect(action("memory_show: memory_cat_presentation")).toHaveLength(1);
    await act(async () => { await saveButton().props.onPress(); });
    expect(h.patchCulinaryMemory.mock.calls[0]![0].excludedKeys).toEqual(["presentation", "flavours"]);
  });

  it("declares the cuisine through a register shortcut and saves it as a cuisine correction", async () => {
    h.patchCulinaryMemory.mockImplementation(async (body) => ({ ...empty, ...body }));
    await render(empty);
    await press("memory_declare: memory_cat_cuisine");
    expect(saveButton().props.disabled).toBe(true);
    await press("memory_register_contemporary");
    expect(input()!.props.value).toBe("memory_register_contemporary — ");
    expect(input()!.props.maxLength).toBe(160);
    await act(async () => { input()!.props.onChangeText(`${input()!.props.value}producto del Adriático`); });
    await press("memory_register_classic");
    expect(input()!.props.value).toBe("memory_register_classic — producto del Adriático");
    expect(saveButton().props.disabled).toBe(false);
    await act(async () => { await saveButton().props.onPress(); });
    expect(h.patchCulinaryMemory.mock.calls[0]![0].corrections).toEqual([{ key: "cuisine", text: "memory_register_classic — producto del Adriático" }]);
  });

  it("offers register shortcuts only for the cuisine", async () => {
    await render(empty);
    await press("memory_declare: memory_cat_techniques");
    expect(input()).toBeDefined();
    expect(action("memory_register_classic")).toHaveLength(0);
  });

  it("shows readers the categories, texts and tags without any action", async () => {
    await render({
      ...empty, canEdit: false,
      learned: [{ key: "flavours", text: "Acidez marcada" }], corrections: [{ key: "cuisine", text: "Cocina de mercado" }], excludedKeys: ["textures"],
    });
    expect(texts()).toEqual(expect.arrayContaining(["memory_cat_cuisine", "Cocina de mercado", "memory_tag_declared", "Acidez marcada", "memory_tag_learned", "memory_hidden"]));
    expect(screen.root.findAllByType("Pressable" as never)).toHaveLength(0);
  });
});
