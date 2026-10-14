import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  View: "View",
}));
vi.mock("@/src/theme", () => ({
  colors: new Proxy({}, { get: () => "#000000" }),
  fonts: new Proxy({}, { get: () => "serif" }),
  fontSizes: new Proxy({}, { get: () => 1 }),
  radii: new Proxy({}, { get: () => 1 }),
  spacing: new Proxy({}, { get: () => 1 }),
}));

import { PickVariantSheet } from "@/src/components/PickVariantSheet";

const candidates = [
  { id: "g1", name: "Gambero rosso", origen: "Mazara", calibreLabel: "cal.3", precioCompra: 4500, unidadCompra: "kg" },
  { id: "g2", name: "Gambero rosso", origen: "Sicilia", calibreLabel: "15/20", precioCompra: null, unidadCompra: null },
];

function render(onPick = vi.fn(), onNone = vi.fn()) {
  let screen!: ReactTestRenderer;
  act(() => {
    screen = create(createElement(PickVariantSheet, {
      open: true, rawText: "gambero rosso", candidates,
      title: "pick_variant_title", body: "pick_variant_body", noneLabel: "pick_variant_none",
      onPick, onNone,
    }));
  });
  return screen;
}

describe("PickVariantSheet", () => {
  it("shows one option per sibling with its origin and calibre", () => {
    const screen = render();
    const options = screen.root.findAll((n) => n.props.testID?.startsWith?.("pick-variant-option-"));
    expect(options.map((o) => o.props.testID)).toEqual(["pick-variant-option-g1", "pick-variant-option-g2"]);
    const texts = screen.root.findAllByType("Text" as never).map((t) => [t.props.children].flat().join(""));
    expect(texts).toContain("Mazara · cal.3");
    expect(texts).toContain("Sicilia · 15/20");
  });

  it("picking an option returns its product id", () => {
    const onPick = vi.fn();
    const screen = render(onPick);
    act(() => screen.root.find((n) => n.props.testID === "pick-variant-option-g2").props.onPress());
    expect(onPick).toHaveBeenCalledWith("g2");
  });

  it("'none of these' calls onNone", () => {
    const onNone = vi.fn();
    const screen = render(vi.fn(), onNone);
    act(() => screen.root.find((n) => n.props.testID === "pick-variant-none").props.onPress());
    expect(onNone).toHaveBeenCalledTimes(1);
  });
});
