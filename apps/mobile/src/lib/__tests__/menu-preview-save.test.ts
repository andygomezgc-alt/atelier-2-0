import { describe, expect, it, vi } from "vitest";
import { createPreviewSaveQueue, flushPreviewChanges } from "../menu-preview-save";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("menu preview saves", () => {
  it("accumulates edits from different fields while an earlier save is pending", async () => {
    const first = deferred();
    const writes: Array<{ title: string; price: number }> = [];
    const save = vi.fn(async (draft: { title: string; price: number }) => {
      writes.push(draft);
      if (writes.length === 1) await first.promise;
    });
    const queue = createPreviewSaveQueue({ title: "Original", price: 10 }, save);
    queue.update((draft) => ({ ...draft, title: "Seasonal menu" }));
    const pending = queue.flush();
    queue.update((draft) => ({ ...draft, price: 18 }));
    const second = queue.flush();
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve();
    await Promise.all([pending, second]);
    expect(writes).toEqual([
      { title: "Seasonal menu", price: 10 },
      { title: "Seasonal menu", price: 18 },
    ]);
  });

  it("flush includes text still waiting for its debounce and waits before exporting", async () => {
    const request = deferred();
    const saved: string[] = [];
    const queue = createPreviewSaveQueue("Old price", async (draft) => {
      await request.promise;
      saved.push(draft);
    });
    queue.update(() => "New price");
    const download = vi.fn();
    const exportPromise = queue.flush().then(download);
    expect(download).not.toHaveBeenCalled();
    request.resolve();
    await exportPromise;
    expect(saved).toEqual(["New price"]);
    expect(download).toHaveBeenCalledOnce();
  });

  it("retains failed edits for retry and does not export a stale result", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const queue = createPreviewSaveQueue({ price: 10 }, save);
    queue.update(() => ({ price: 20 }));
    const download = vi.fn();
    await expect(queue.flush().then(download)).rejects.toThrow("offline");
    expect(download).not.toHaveBeenCalled();
    expect(queue.hasPending()).toBe(true);
    queue.sync({ price: 10 });
    expect(queue.get()).toEqual({ price: 20 });
    await queue.flush();
    expect(save).toHaveBeenLastCalledWith({ price: 20 }, { price: 10 });
    expect(queue.hasPending()).toBe(false);
  });

  it("does not write when a field is reverted before its debounce", async () => {
    const save = vi.fn();
    const queue = createPreviewSaveQueue({ title: "Original" }, save);
    queue.update(() => ({ title: "Changed" }));
    queue.update(() => ({ title: "Original" }));
    await queue.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("publishes a toggle immediately while its save is pending, then restores the latest snapshot on reopen", async () => {
    const request = deferred();
    const queue = createPreviewSaveQueue({ showAllergens: true }, async () => request.promise);
    const rendered: boolean[] = [];
    const unsubscribe = queue.subscribe(() => { rendered.push(queue.get().showAllergens); });
    queue.update(() => ({ showAllergens: false }));
    const pending = queue.flush();
    expect(rendered).toEqual([false]);
    queue.sync({ showAllergens: true });
    expect(queue.get().showAllergens).toBe(false);
    expect(rendered).toEqual([false]);
    request.resolve();
    await pending;
    queue.sync({ showAllergens: true });
    expect(rendered).toEqual([false, true]);
    unsubscribe();
    queue.update(() => ({ showAllergens: false }));
    expect(rendered).toEqual([false, true]);
  });

  it("waits for the saved parent snapshot before closing so reopening cannot restore old prices", async () => {
    let database = { price: 10 };
    let menuProp = database;
    const queue = createPreviewSaveQueue(database, async (next) => { database = next; });
    queue.update(() => ({ price: 20 }));
    const refreshed = deferred();
    const closed = vi.fn();
    const completion = flushPreviewChanges(queue.flush, [], async () => {
      await refreshed.promise;
      menuProp = database;
    }).then(() => {
      closed();
      queue.sync(menuProp); // The user opens the preview again immediately.
    });
    await Promise.resolve();
    expect(closed).not.toHaveBeenCalled();
    refreshed.resolve();
    await completion;
    expect(queue.get()).toEqual({ price: 20 });
  });
});
