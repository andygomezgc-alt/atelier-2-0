// Actual fix sheet for an ingredient without cost, with the network and
// native layers replaced: what Save sends, when it confirms, and that it never
// confirms while the ingredient still needs the weight of one piece.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  patchProduct: vi.fn(),
  toast: vi.fn(),
  onClose: vi.fn(),
  onSaved: vi.fn(),
  t: (key: string) => key,
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
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock("@/src/api/products", () => ({ getProduct: h.getProduct, patchProduct: h.patchProduct }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("@/src/components/Button", () => ({ Button: "Button" }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: (e: Error) => `translated:${e.message}` }));

import { IngredientFixSheet } from "../components/IngredientFixSheet";

const FISH = {
  id: "p-fish",
  name: "Lubina",
  category: "pescado",
  unidadCompra: "unidad",
  precioCompra: 1200,
  gramosPorLitro: null,
  pezzaturaMode: "g_per_piece",
  pezzaturaMin: 450,
  pezzaturaMax: 450,
};
const TENTACLES = {
  ...FISH,
  id: "p-tentacles",
  name: "Tentáculos",
  category: "otro",
  precioCompra: 300,
  pezzaturaMode: null,
  pezzaturaMin: null,
  pezzaturaMax: null,
};

let screen: ReactTestRenderer;
const textOf = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
const texts = () => screen.root.findAllByType("Text" as never).map(textOf);
const button = (label: string) => screen.root.findByProps({ label });
const inputs = () => screen.root.findAllByType("TextInput" as never);
const priceInput = () => inputs().find((i) => i.props.placeholder === "0,00")!;
const pieceWeightInput = () => inputs().find((i) => i.props.placeholder === "—");

async function render(product: object, recipeUnit = "g") {
  h.getProduct.mockResolvedValue(product);
  await act(async () => {
    screen = create(
      createElement(IngredientFixSheet, {
        target: { productId: (product as { id: string }).id, recipeUnit },
        onClose: h.onClose,
        onSaved: h.onSaved,
      }),
    );
  });
}
async function type(input: ReactTestInstance | undefined, value: string) {
  await act(async () => {
    input!.props.onChangeText(value);
  });
}
async function save() {
  await act(async () => {
    await button("btn_save").props.onPress();
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
});
afterEach(async () => {
  if (screen) await act(async () => { screen.unmount(); });
});

describe("IngredientFixSheet save", () => {
  it("closes without a PATCH when nothing changed", async () => {
    await render(FISH);
    await save();
    expect(h.patchProduct).not.toHaveBeenCalled();
    expect(h.onClose).toHaveBeenCalledOnce();
    expect(h.onSaved).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("sends only the changed fields, confirms and hands over to the parent", async () => {
    h.patchProduct.mockResolvedValue({ ...FISH, precioCompra: 1250 });
    await render(FISH);
    await type(priceInput(), "12,5");
    await save();
    expect(h.patchProduct).toHaveBeenCalledOnce();
    expect(h.patchProduct).toHaveBeenCalledWith("p-fish", { precioCompra: 1250 });
    expect(h.toast).toHaveBeenCalledWith("toast_producto_saved");
    expect(h.onSaved).toHaveBeenCalledOnce();
  });

  it("keeps the sheet open with the error when the PATCH fails", async () => {
    h.patchProduct.mockRejectedValue(new Error("invalid_pezzatura"));
    await render(FISH);
    await type(priceInput(), "13");
    await save();
    expect(texts()).toContain("translated:invalid_pezzatura");
    expect(h.onSaved).not.toHaveBeenCalled();
    expect(h.onClose).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(button("btn_save").props.disabled).toBe(false);
  });

  it("sends one PATCH on a double tap and cannot be closed mid-request", async () => {
    let finish!: (value: unknown) => void;
    h.patchProduct.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render(FISH);
    await type(priceInput(), "13");
    await act(async () => {
      void button("btn_save").props.onPress();
      void button("btn_save").props.onPress();
    });
    expect(h.patchProduct).toHaveBeenCalledOnce();
    await act(async () => { button("confirm_cancel").props.onPress(); });
    expect(h.onClose).not.toHaveBeenCalled();
    await act(async () => { finish({ ...FISH, precioCompra: 1300 }); });
    expect(h.onSaved).toHaveBeenCalledOnce();
  });
});

// Costes por ingrediente (A3): a product whose category has no piece size of
// its own still takes the weight of one piece.
describe("IngredientFixSheet piece weight on a category without a piece size", () => {
  it("asks for the weight of 1 unit and saves it as grams per piece", async () => {
    h.patchProduct.mockResolvedValue({ ...TENTACLES, pezzaturaMode: "g_per_piece", pezzaturaMin: 120, pezzaturaMax: 120 });
    await render(TENTACLES);
    expect(texts()).toContain("peso_por_unidad_label");
    await type(pieceWeightInput(), "120");
    await save();
    expect(h.patchProduct).toHaveBeenCalledOnce();
    expect(h.patchProduct).toHaveBeenCalledWith("p-tentacles", { pezzaturaInput: "120 g/pz" });
    expect(h.onSaved).toHaveBeenCalledOnce();
  });

  it("never confirms a save that leaves the ingredient needing a piece weight", async () => {
    await render(TENTACLES);
    await type(priceInput(), "4");
    await save();
    expect(texts()).toContain("grams_invalid");
    expect(h.patchProduct).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.onSaved).not.toHaveBeenCalled();
  });
});
