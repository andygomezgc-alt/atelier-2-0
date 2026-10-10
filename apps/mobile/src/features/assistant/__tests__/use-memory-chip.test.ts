// E7: the "Memoria" chip state. It reads the memory only with a real restaurant, hides itself
// (null) while loading or on error, ignores stale responses and reloads when the sheet closes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { getCulinaryMemory } = vi.hoisted(() => ({ getCulinaryMemory: vi.fn() }));
vi.mock("@/src/api/culinary-memory", () => ({ getCulinaryMemory }));

import { useMemoryChip } from "../use-memory-chip";

type Chip = ReturnType<typeof useMemoryChip>;
let chip: Chip;
function Probe({ restaurantId }: { restaurantId: string | null }) {
  chip = useMemoryChip(restaurantId);
  return null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function render(restaurantId: string | null) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(Probe, { restaurantId })); });
  return renderer;
}

beforeEach(() => {
  getCulinaryMemory.mockReset();
});

describe("useMemoryChip", () => {
  it("does not read the memory without a real restaurant and stays hidden", async () => {
    await render(null);
    expect(getCulinaryMemory).not.toHaveBeenCalled();
    expect(chip.enabled).toBeNull();
  });

  it("is hidden while loading and shows the restaurant's memory state", async () => {
    const pending = deferred<{ restaurantId: string; enabled: boolean }>();
    getCulinaryMemory.mockReturnValue(pending.promise);
    await render("r1");
    expect(chip.enabled).toBeNull();
    await act(async () => { pending.resolve({ restaurantId: "r1", enabled: false }); });
    expect(chip.enabled).toBe(false);
  });

  it("stays hidden when the read fails", async () => {
    getCulinaryMemory.mockRejectedValue(new Error("offline"));
    await render("r1");
    expect(chip.enabled).toBeNull();
  });

  it("ignores a late response from the previous restaurant", async () => {
    const first = deferred<{ restaurantId: string; enabled: boolean }>();
    getCulinaryMemory.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ restaurantId: "r2", enabled: false });
    const renderer = await render("r1");
    await act(async () => { renderer.update(createElement(Probe, { restaurantId: "r2" })); });
    expect(chip.enabled).toBe(false);
    await act(async () => { first.resolve({ restaurantId: "r1", enabled: true }); });
    expect(chip.enabled).toBe(false);
    expect(getCulinaryMemory).toHaveBeenCalledTimes(2);
  });

  it("opens the sheet and reloads the state when it closes", async () => {
    getCulinaryMemory.mockResolvedValueOnce({ restaurantId: "r1", enabled: true }).mockResolvedValueOnce({ restaurantId: "r1", enabled: false });
    await render("r1");
    expect(chip.enabled).toBe(true);
    await act(async () => { chip.openSheet(); });
    expect(chip.open).toBe(true);
    await act(async () => { chip.closeSheet(); });
    expect(chip.open).toBe(false);
    expect(getCulinaryMemory).toHaveBeenCalledTimes(2);
    expect(chip.enabled).toBe(false);
  });
});
