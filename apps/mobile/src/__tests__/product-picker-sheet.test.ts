import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({ list: vi.fn(), pick: vi.fn() }));
vi.mock("react-native", () => ({
  Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View", StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("@/src/api/products", () => ({ listProducts: h.list }));

import { ProductPickerSheet } from "@/src/components/invoices/ProductPickerSheet";

let sheet: ReactTestRenderer;
const type = async (text: string) => {
  await act(async () => { sheet.root.findByType("TextInput" as never).props.onChangeText(text); });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
};

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.list.mockResolvedValue([{ id: "p1", name: "Zucchine" }, { id: "p2", name: "Zucchine trombetta" }]);
  await act(async () => { sheet = create(createElement(ProductPickerSheet, { open: true, onPick: h.pick, onClose: vi.fn() })); });
});
afterEach(async () => {
  await act(async () => { sheet.unmount(); });
  vi.useRealTimers();
});

describe("ProductPickerSheet", () => {
  it("searches the bank after a short pause and picks a result", async () => {
    await type("zucc");
    expect(h.list).toHaveBeenCalledWith({ q: "zucc" });
    const row = sheet.root.findAllByType("Pressable" as never).find((n) => n.props.accessibilityLabel === "Zucchine trombetta");
    await act(async () => { row?.props.onPress(); });
    expect(h.pick).toHaveBeenCalledWith("p2");
  });

  it("keeps every result reachable: rows scroll and taps work with the keyboard open", async () => {
    await type("zucc");
    const list = sheet.root.findByType("ScrollView" as never);
    expect(list.props.keyboardShouldPersistTaps).toBe("handled");
    const rows = sheet.root.findAllByType("Pressable" as never);
    expect(rows).toHaveLength(2);
    expect(list.findAllByType("Pressable" as never)).toHaveLength(2);
  });

  it("does not search for a single letter, and says when nothing matches", async () => {
    await type("z");
    expect(h.list).not.toHaveBeenCalled();
    h.list.mockResolvedValue([]);
    await type("zz");
    expect(sheet.root.findAllByType("Text" as never).map((n) => n.children.join(""))).toContain("invoice_picker_empty");
  });
});
