import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

vi.mock("react-native", () => ({
  Modal: "Modal", Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", View: "View", StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
}));

import { PickVariantSheet } from "@/src/components/PickVariantSheet";

const base = {
  open: true, rawText: "Calamari", candidates: [], title: "title", body: "body", noneLabel: "none label",
  onPick: vi.fn(), onNone: vi.fn(),
};

let sheet: ReactTestRenderer;
const render = async (extra: Record<string, unknown> = {}) => {
  await act(async () => { sheet = create(createElement(PickVariantSheet, { ...base, ...extra })); });
};
const other = () => sheet.root.findAll((n) => n.props.testID === "pick-variant-other");

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});
afterEach(async () => { await act(async () => { sheet.unmount(); }); });

describe("PickVariantSheet", () => {
  it("offers no extra button unless both the label and the handler are given", async () => {
    await render();
    expect(other()).toHaveLength(0);
    await act(async () => { sheet.unmount(); });
    await render({ otherLabel: "search" });
    expect(other()).toHaveLength(0);
    await act(async () => { sheet.unmount(); });
    await render({ onOther: vi.fn() });
    expect(other()).toHaveLength(0);
  });

  it("shows the extra button with its label and calls onOther when pressed", async () => {
    const onOther = vi.fn();
    await render({ otherLabel: "search another", onOther });
    const button = other()[0]!;
    expect(button.findAllByType("Text" as never).map((n) => n.children.join(""))).toContain("search another");
    await act(async () => { button.props.onPress(); });
    expect(onOther).toHaveBeenCalledTimes(1);
    expect(base.onNone).not.toHaveBeenCalled();
  });

  it("keeps the none button working", async () => {
    await render();
    await act(async () => { sheet.root.findAll((n) => n.props.testID === "pick-variant-none")[0]!.props.onPress(); });
    expect(base.onNone).toHaveBeenCalledTimes(1);
  });
});
