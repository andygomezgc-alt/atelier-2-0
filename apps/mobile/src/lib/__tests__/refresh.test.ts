import { afterEach, describe, expect, it, vi } from "vitest";
import * as cacheModule from "@/src/api/cache";
import { cached, clearAll } from "@/src/api/cache";
import { forceRefresh } from "../refresh";

// Spiamos el `invalidate` real del módulo de caché (en vez de vi.mock del
// módulo entero) porque el último test necesita la caché REAL para probar
// el fix de inflight — así todos los tests comparten el mismo módulo y solo
// mockeamos la implementación cuando hace falta, restaurándola after each.
describe("forceRefresh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll();
  });

  it("invalida todos los prefijos antes de llamar a reload (orden verificable)", async () => {
    const order: string[] = [];
    const invalidateSpy = vi
      .spyOn(cacheModule, "invalidate")
      .mockImplementation((prefix: string) => {
        order.push(`invalidate:${prefix}`);
      });
    const reload = vi.fn(async () => {
      order.push("reload");
      return "done";
    });

    const result = await forceRefresh(["recipes:", "menus:list"], reload);

    expect(result).toBe("done");
    expect(order).toEqual(["invalidate:recipes:", "invalidate:menus:list", "reload"]);
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("dedup de prefijos repetidos — cada prefijo único se invalida una sola vez", async () => {
    const invalidateSpy = vi.spyOn(cacheModule, "invalidate").mockImplementation(() => {});
    const reload = vi.fn(async () => "ok");

    await forceRefresh(["recipes:", "recipes:", "menus:list", "recipes:"], reload);

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenNthCalledWith(1, "recipes:");
    expect(invalidateSpy).toHaveBeenNthCalledWith(2, "menus:list");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("propaga el error de reload", async () => {
    vi.spyOn(cacheModule, "invalidate").mockImplementation(() => {});
    const boom = new Error("boom");
    const reload = vi.fn(async () => {
      throw boom;
    });

    await expect(forceRefresh(["recipes:"], reload)).rejects.toThrow("boom");
  });

  it("invalidate limpia inflight — un refresh forzado refetchea de verdad (caché real)", async () => {
    let calls = 0;
    function slowFetcher(): Promise<string> {
      calls++;
      const callNumber = calls;
      return new Promise((resolve) => {
        setTimeout(() => resolve(`v${callNumber}`), 10);
      });
    }

    // Primera llamada: queda "inflight" (el fetcher todavía no resolvió).
    const first = cached("refresh-test:inflight", slowFetcher, 30_000);
    expect(calls).toBe(1);

    // Un refresh forzado invalida mientras el fetch anterior sigue en curso.
    cacheModule.invalidate("refresh-test:");

    // Sin el fix, cached() encontraría la promesa vieja en `inflight` y la
    // reusaría en vez de refetchear — el fetcher solo se habría llamado 1 vez.
    const second = cached("refresh-test:inflight", slowFetcher, 30_000);
    expect(calls).toBe(2);

    await Promise.all([first, second]);
    expect(calls).toBe(2);
  });
});
