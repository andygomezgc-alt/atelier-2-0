// A12b: characterization of the streamed-text store (typewriter reveal), pinned against the reviewed module.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStreamText } from "../stream-text-store";

const TICK_MS = 33;

// Lets promise callbacks run after a timer step.
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function tick(ms = TICK_MS) {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

function track(promise: Promise<string>) {
  const state: { settled: boolean; value?: string } = { settled: false };
  promise.then((value) => {
    state.settled = true;
    state.value = value;
  });
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("finish", () => {
  it("resolves only once the reveal has caught up with the final text", async () => {
    const stream = createStreamText();
    const full = "Berenjena asada con yogur";
    stream.push(full);
    const done = track(stream.finish(full));
    expect(done.settled).toBe(false);

    let ticks = 0;
    while (!done.settled && ticks < 100) {
      expect(full.startsWith(stream.getSnapshot())).toBe(true);
      await tick();
      ticks++;
    }

    expect(done.settled).toBe(true);
    expect(stream.getSnapshot()).toBe(full);
    expect(done.value).toBe(full);
  });

  it("resolves at once when the reveal has already caught up", async () => {
    const stream = createStreamText();
    stream.push("ab");
    await tick();
    expect(stream.getSnapshot()).toBe("ab");

    const done = track(stream.finish("ab"));
    await flush();
    expect(done.settled).toBe(true);
    expect(done.value).toBe("ab");
  });

  it("falls back to the streamed text when the final text is empty", async () => {
    const stream = createStreamText();
    stream.push("hola");
    const done = track(stream.finish(""));

    let ticks = 0;
    while (!done.settled && ticks < 100) {
      await tick();
      ticks++;
    }

    expect(done.value).toBe("hola");
    expect(stream.getSnapshot()).toBe("hola");
  });
});

describe("reset and dispose while a finish is pending", () => {
  it("reset releases the waiter so the turn cannot hang, and empties the store", async () => {
    const stream = createStreamText();
    const full = "Respuesta larga que todavía se está revelando";
    stream.push(full);
    await tick();
    const pending = track(stream.finish(full));
    expect(pending.settled).toBe(false);

    stream.reset();
    await flush();

    expect(pending.settled).toBe(true);
    // The waiter resolves with the text it was waiting for: release happens before the target is cleared.
    expect(pending.value).toBe(full);
    expect(stream.getSnapshot()).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reset empties the store and notifies subscribers once", async () => {
    const stream = createStreamText();
    const listener = vi.fn();
    stream.subscribe(listener);
    stream.push("Hola mundo");
    await tick();
    listener.mockClear();

    stream.reset();
    expect(stream.getSnapshot()).toBe("");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dispose releases the waiter and stops the ticker, and no subscriber hears from it again", async () => {
    const stream = createStreamText();
    const full = "Respuesta que se corta al desmontar la pantalla";
    stream.push(full);
    await tick();
    const pending = track(stream.finish(full));
    const shownAtDispose = stream.getSnapshot();
    const listener = vi.fn();
    stream.subscribe(listener);

    stream.dispose();
    await flush();

    expect(pending.settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await tick(TICK_MS * 10);
    expect(listener).not.toHaveBeenCalled();
    // Dispose stops the reveal; it does not clear what was already shown (reset does).
    expect(stream.getSnapshot()).toBe(shownAtDispose);
  });

  it("a new turn after reset streams normally", async () => {
    const stream = createStreamText();
    stream.push("Primera respuesta");
    const pending = track(stream.finish("Primera respuesta"));
    stream.reset();
    await flush();
    expect(pending.settled).toBe(true);

    expect(stream.push("Segunda")).toBe(true);
    await tick(TICK_MS * 5);
    expect(stream.getSnapshot()).toBe("Segunda");
  });
});

describe("reveal edge", () => {
  it("never splits a surrogate pair (emoji) at the edge of the reveal", async () => {
    const stream = createStreamText();
    // The first step would end right after a high surrogate: the reveal must take the whole pair.
    const full = "ab🍅🍅🍅🍅🍅🍅cd";
    stream.push(full);
    const done = track(stream.finish(full));

    await tick();
    expect(stream.getSnapshot()).toBe("ab🍅");

    const snapshots: string[] = [stream.getSnapshot()];
    let ticks = 0;
    while (!done.settled && ticks < 100) {
      await tick();
      snapshots.push(stream.getSnapshot());
      ticks++;
    }

    for (const shown of snapshots) {
      const last = shown.charCodeAt(shown.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    }
    expect(stream.getSnapshot()).toBe(full);
  });
});

describe("ticker", () => {
  it("stops when nothing is left to reveal and restarts on the next push", async () => {
    const stream = createStreamText();
    const listener = vi.fn();
    stream.subscribe(listener);

    stream.push("hola");
    stream.push("!");
    expect(vi.getTimerCount()).toBe(1);

    await tick(); // "hol"
    await tick(); // "hola!"
    expect(stream.getSnapshot()).toBe("hola!");
    expect(vi.getTimerCount()).toBe(1);

    await tick(); // nothing left: the ticker stops itself
    expect(vi.getTimerCount()).toBe(0);
    const callsWhenCaughtUp = listener.mock.calls.length;
    await tick(TICK_MS * 10);
    expect(listener.mock.calls.length).toBe(callsWhenCaughtUp);

    stream.push(" mundo");
    expect(vi.getTimerCount()).toBe(1);
    await tick(TICK_MS * 10);
    expect(stream.getSnapshot()).toBe("hola! mundo");
  });
});

describe("push", () => {
  it("returns true only for the first delta of a turn", () => {
    const stream = createStreamText();
    expect(stream.push("Ber")).toBe(true);
    expect(stream.push("enjena")).toBe(false);
    expect(stream.push(" asada")).toBe(false);
  });

  it("does not count an empty delta as the first one, so the start is signalled once", () => {
    const stream = createStreamText();
    expect(stream.push("")).toBe(false);
    expect(stream.push("Ber")).toBe(true);
    expect(stream.push("enjena")).toBe(false);
  });
});

describe("subscribers", () => {
  it("are notified once per revealed step, with the text shown at that step", async () => {
    const stream = createStreamText();
    const seen: string[] = [];
    stream.subscribe(() => seen.push(stream.getSnapshot()));

    stream.push("abcdef");
    await tick(TICK_MS * 5);

    // Two steps reveal text; the step that finds nothing new does not notify.
    expect(seen).toEqual(["abc", "abcdef"]);
  });

  it("notifies every subscriber", async () => {
    const stream = createStreamText();
    const first = vi.fn();
    const second = vi.fn();
    stream.subscribe(first);
    stream.subscribe(second);

    stream.push("abc");
    await tick();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops notifying a listener after its unsubscribe function runs", async () => {
    const stream = createStreamText();
    const listener = vi.fn();
    const unsubscribe = stream.subscribe(listener);

    stream.push("abcdef");
    await tick();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await tick(TICK_MS * 5);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(stream.getSnapshot()).toBe("abcdef");
  });
});
