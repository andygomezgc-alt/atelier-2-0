// Proposal 5: while a list loads, ghost cards with the cards' shape replace the spinner.
// The pulse stops when the system asks to reduce motion.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  reduceMotion: false,
  firstRead: null as Promise<boolean> | null,
  start: vi.fn(),
  stop: vi.fn(),
  listener: null as ((enabled: boolean) => void) | null,
}));

vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => h.firstRead ?? Promise.resolve(h.reduceMotion),
    addEventListener: (_event: string, fn: (enabled: boolean) => void) => {
      h.listener = fn;
      return { remove: () => { h.listener = null; } };
    },
  },
  Animated: {
    View: "Animated.View",
    Value: class { constructor(public value: number) {} setValue(v: number) { this.value = v; } },
    loop: () => ({ start: h.start, stop: h.stop }),
    sequence: (steps: unknown[]) => steps,
    timing: (_value: unknown, config: unknown) => config,
  },
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
}));
vi.mock("@/src/theme", () => ({
  colors: new Proxy({}, { get: () => "#000000" }),
  radii: new Proxy({}, { get: () => 4 }),
  spacing: new Proxy({}, { get: () => 4 }),
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { SkeletonList } from "../SkeletonList";

let tree: ReactTestRenderer;
async function render(props: { rows?: number; hero?: boolean } = {}) {
  await act(async () => { tree = create(createElement(SkeletonList, props)); });
}
const cards = () => tree.root.findAll((n) => n.props.testID === "skeleton-card");

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.reduceMotion = false;
  h.firstRead = null;
});
afterEach(async () => { if (tree) await act(async () => { tree.unmount(); }); });

describe("SkeletonList", () => {
  it("draws the requested ghost cards, plus a hero block when asked, announced as loading", async () => {
    await render({ rows: 3 });
    expect(cards()).toHaveLength(3);
    expect(tree.root.findAll((n) => n.props.testID === "skeleton-hero")).toHaveLength(0);
    const root = tree.root.findByType("Animated.View" as never);
    expect(root.props.accessibilityLabel).toBe("skeleton_loading");
    expect(root.props.accessibilityState).toEqual({ busy: true });
    await act(async () => { tree.unmount(); });
    await render({ rows: 2, hero: true });
    expect(cards()).toHaveLength(2);
    expect(tree.root.findAll((n) => n.props.testID === "skeleton-hero")).toHaveLength(1);
  });

  it("pulses while loading and stops pulsing when unmounted", async () => {
    await render();
    expect(h.start).toHaveBeenCalledOnce();
    await act(async () => { tree.unmount(); });
    expect(h.stop).toHaveBeenCalled();
  });

  it("stays still when the system reduces motion, also if it is turned on while loading", async () => {
    h.reduceMotion = true;
    await render();
    expect(h.start).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
    h.reduceMotion = false;
    await render();
    expect(h.start).toHaveBeenCalledOnce();
    await act(async () => { h.listener?.(true); });
    expect(h.stop).toHaveBeenCalled();
  });
});

describe("SkeletonList startup", () => {
  it("a reduce-motion change during the first read wins over that read's stale answer", async () => {
    let answer!: (enabled: boolean) => void;
    h.firstRead = new Promise<boolean>((resolve) => { answer = resolve; });
    await render();
    await act(async () => { h.listener?.(true); });
    await act(async () => { answer(false); });
    expect(h.start).not.toHaveBeenCalled();
  });

  it("pulses when the first read fails, as the setting is then unknown", async () => {
    let fail!: (error: Error) => void;
    h.firstRead = new Promise<boolean>((_resolve, reject) => { fail = reject; });
    await render();
    expect(h.start).not.toHaveBeenCalled();
    await act(async () => { fail(new Error("unavailable")); });
    expect(h.start).toHaveBeenCalledOnce();
  });

  it("a reduce-motion change during the first read wins over that read failing", async () => {
    let fail!: (error: Error) => void;
    h.firstRead = new Promise<boolean>((_resolve, reject) => { fail = reject; });
    await render();
    await act(async () => { h.listener?.(true); });
    await act(async () => { fail(new Error("unavailable")); });
    expect(h.start).not.toHaveBeenCalled();
  });
});
