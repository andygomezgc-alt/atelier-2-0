// While the microphone listens, a ring pulses around it so the chef sees that dictation is on.
// The ring stays still when the system asks to reduce motion.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  reduceMotion: false,
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(h.reduceMotion),
    addEventListener: () => ({ remove: () => undefined }),
  },
  Animated: {
    View: "Animated.View",
    Value: class {
      constructor(public value: number) {}
      setValue(v: number) { this.value = v; }
      interpolate(config: unknown) { return config; }
    },
    loop: () => ({ start: h.start, stop: h.stop }),
    timing: (_value: unknown, config: unknown) => config,
  },
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
}));

import { ListeningPulse } from "../ListeningPulse";

let tree: ReactTestRenderer;
async function render(active: boolean) {
  const element = createElement(ListeningPulse, { active, size: 36, color: "#a0522d", children: createElement("Mic") });
  await act(async () => {
    if (tree) tree.update(element);
    else tree = create(element);
  });
}
const rings = () => tree.root.findAll((n) => n.props.testID === "listening-ring");

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.reduceMotion = false;
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = undefined as unknown as ReactTestRenderer;
});

describe("ListeningPulse", () => {
  it("shows only the microphone while not listening", async () => {
    await render(false);
    expect(rings()).toHaveLength(0);
    expect(tree.root.findAllByType("Mic" as never)).toHaveLength(1);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("pulses a ring around the microphone while listening, and stops when listening ends", async () => {
    await render(true);
    expect(rings()).toHaveLength(1);
    expect(rings()[0]!.props.pointerEvents).toBe("none");
    expect(h.start).toHaveBeenCalledOnce();

    await render(false);
    expect(h.stop).toHaveBeenCalledOnce();
    expect(rings()).toHaveLength(0);
  });

  it("keeps the ring still when the system reduces motion", async () => {
    h.reduceMotion = true;
    await render(true);
    expect(rings()).toHaveLength(1);
    expect(h.start).not.toHaveBeenCalled();
  });
});
