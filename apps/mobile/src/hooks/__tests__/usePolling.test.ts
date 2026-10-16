import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  tick: vi.fn(),
  remove: vi.fn(),
  listener: null as ((state: string) => void) | null,
  appState: { currentState: "active" },
}));
vi.mock("react-native", () => ({
  AppState: Object.assign(h.appState, {
    addEventListener: (_: string, fn: (state: string) => void) => { h.listener = fn; return { remove: h.remove }; },
  }),
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]) };
});

import { usePolling } from "../usePolling";

function Probe({ active }: { active: boolean }) {
  usePolling(active, h.tick, 1000);
  return null;
}
let tree: ReactTestRenderer;
const render = async (active: boolean) => { await act(async () => { tree = create(createElement(Probe, { active })); }); };

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.appState.currentState = "active";
});
afterEach(() => vi.useRealTimers());

describe("usePolling", () => {
  it("ticks every interval while active", async () => {
    await render(true);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(h.tick).toHaveBeenCalledTimes(3);
  });

  it("never ticks while inactive", async () => {
    await render(false);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(h.tick).not.toHaveBeenCalled();
  });

  it("stops when the screen goes away", async () => {
    await render(true);
    await act(async () => { tree.unmount(); });
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(h.tick).not.toHaveBeenCalled();
    expect(h.remove).toHaveBeenCalled();
  });

  it("pauses in the background and refreshes once on return", async () => {
    await render(true);
    await act(async () => { h.listener?.("background"); vi.advanceTimersByTime(5000); });
    expect(h.tick).not.toHaveBeenCalled();
    await act(async () => { h.listener?.("active"); });
    expect(h.tick).toHaveBeenCalledTimes(1);
  });
});
