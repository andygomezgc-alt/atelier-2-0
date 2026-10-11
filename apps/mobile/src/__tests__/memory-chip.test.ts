// "Memoria" chip in the chat actions row, with the native layer replaced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({ onPress: vi.fn(), t: (key: string) => key }));
vi.mock("react-native", () => ({
  Pressable: "Pressable", Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: h.t }) }));

import { MemoryChip } from "../components/MemoryChip";
import { colors } from "../theme";

let screen: ReactTestRenderer;
const flat = (style: unknown): Record<string, unknown> =>
  [style].flat(Infinity).filter(Boolean).reduce((acc: Record<string, unknown>, s) => ({ ...acc, ...(s as object) }), {});
const chip = () => screen.root.findByType("Pressable" as never);
const chipStyle = () => {
  const style = chip().props.style;
  return flat(typeof style === "function" ? style({ pressed: false }) : style);
};
const label = () => screen.root.findByType("Text" as never);
const dot = () => screen.root.findAllByType("View" as never).find((node) => flat(node.props.style).width === 8)!;
async function render(enabled: boolean) {
  await act(async () => { screen = create(createElement(MemoryChip, { enabled, onPress: h.onPress })); });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("memory chip in the chat", () => {
  it("uses a dark green that keeps contrast on paper", () => {
    expect(colors.green).toBe("#3f6b4a");
  });

  it("shows the memory on in green with an 8px dot", async () => {
    await render(true);
    expect(label().props.children).toBe("chat_memory");
    expect(flat(label().props.style).color).toBe(colors.green);
    expect(chipStyle().borderColor).toBe(colors.green);
    expect(flat(dot().props.style)).toMatchObject({ width: 8, height: 8, backgroundColor: colors.green });
  });

  it("shows the memory off in grey", async () => {
    await render(false);
    expect(label().props.children).toBe("chat_memory_off");
    expect(flat(label().props.style).color).toBe(colors.mute);
    expect(chipStyle().borderColor).toBe(colors.edge);
    expect(flat(dot().props.style).backgroundColor).toBe(colors.mute);
  });

  it("has the same pill measures as the history button", async () => {
    await render(true);
    expect(chipStyle()).toMatchObject({ minHeight: 48, borderWidth: 0.5, borderRadius: 999 });
  });

  it("is an accessible button labelled with the visible text", async () => {
    await render(true);
    expect(chip().props).toMatchObject({ accessibilityRole: "button", accessibilityLabel: "chat_memory", accessibilityHint: "chat_memory_hint" });
  });

  it("labels the memory off with its visible text", async () => {
    await render(false);
    expect(chip().props).toMatchObject({ accessibilityRole: "button", accessibilityLabel: "chat_memory_off", accessibilityHint: "chat_memory_hint" });
  });

  it("calls onPress when tapped", async () => {
    await render(false);
    await act(async () => { chip().props.onPress(); });
    expect(h.onPress).toHaveBeenCalledOnce();
  });
});
