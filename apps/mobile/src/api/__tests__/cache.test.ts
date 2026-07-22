import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, clearAll, invalidate, setCached } from "@/src/api/cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("cache inflight ownership", () => {
  afterEach(() => {
    clearAll();
  });

  it("una promesa invalidada devuelve su resultado pero no pisa un set posterior", async () => {
    const old = deferred<string>();
    const oldResult = cached("recipes:list", () => old.promise, 30_000);
    invalidate("recipes:");
    setCached("recipes:list", "fresh");

    old.resolve("stale");

    expect(await oldResult).toBe("stale");
    const refetch = vi.fn(async () => "unexpected");
    expect(await cached("recipes:list", refetch, 30_000)).toBe("fresh");
    expect(refetch).not.toHaveBeenCalled();
  });

  it("una promesa invalidada no borra a su sucesora en vuelo", async () => {
    const old = deferred<string>();
    const fresh = deferred<string>();
    const oldResult = cached("recipes:list", () => old.promise, 30_000);
    invalidate("recipes:");
    const freshResult = cached("recipes:list", () => fresh.promise, 30_000);

    old.resolve("stale");
    expect(await oldResult).toBe("stale");
    fresh.resolve("fresh");
    expect(await freshResult).toBe("fresh");

    const refetch = vi.fn(async () => "unexpected");
    expect(await cached("recipes:list", refetch, 30_000)).toBe("fresh");
    expect(refetch).not.toHaveBeenCalled();
  });
});
