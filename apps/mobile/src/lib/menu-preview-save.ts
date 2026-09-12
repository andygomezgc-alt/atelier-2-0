// The server replaces the complete override document. Keep one accumulated
// draft and serialize writes so delayed responses cannot drop another field.
export async function flushPreviewChanges(
  flush: () => Promise<void>,
  pending: Iterable<Promise<unknown>>,
  reconcile: () => void | Promise<void>,
): Promise<void> {
  await Promise.all([flush(), ...pending]);
  // Closing and reopening the sheet must not reintroduce the old parent props
  // after the new draft has already been committed on the server.
  await reconcile();
}

export function createPreviewSaveQueue<T>(
  initial: T,
  persist: (next: T, previous: T) => Promise<unknown>,
) {
  let draft = initial;
  let saved = initial;
  let running: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const equal = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  const hasPending = () => !equal(draft, saved);

  function flush(): Promise<void> {
    if (running) return running;
    if (!hasPending()) return Promise.resolve();
    running = (async () => {
      while (hasPending()) {
        const next = draft;
        await persist(next, saved);
        saved = next;
      }
    })().finally(() => { running = null; });
    return running;
  }

  return {
    get: () => draft,
    hasPending,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update: (change: (current: T) => T) => { draft = change(draft); notify(); },
    // Only take an external snapshot when no local changes could be lost.
    sync: (next: T) => {
      if (!running && !hasPending()) { draft = next; saved = next; notify(); }
    },
    flush,
  };
}
