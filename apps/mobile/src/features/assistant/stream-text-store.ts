// Streamed answer text, kept outside React state (A12). Network deltas land in `target`;
// a ticker reveals `shown` a few characters per frame so the answer "types" smoothly.
// Only subscribers (the StreamingBubble) re-render per tick; the screen never does.

const TICK_MS = 33;

export type StreamText = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => string;
  // Appends a network delta. Returns true for the first delta of the turn.
  push: (delta: string) => boolean;
  // Sets the final text and resolves with it once the reveal has caught up.
  finish: (full: string) => Promise<string>;
  reset: () => void;
  dispose: () => void;
};

export function createStreamText(): StreamText {
  const listeners = new Set<() => void>();
  let shown = "";
  let target = "";
  let done = false;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let releaseDrain: (() => void) | null = null;

  function publish(next: string) {
    shown = next;
    for (const listener of listeners) listener();
  }

  function stopTicker() {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function startTicker() {
    if (ticker) return;
    ticker = setInterval(tick, TICK_MS);
  }

  function releaseWaiter() {
    releaseDrain?.();
    releaseDrain = null;
  }

  // The step grows with the backlog, so the reveal never falls far behind the network.
  function tick() {
    if (shown.length < target.length) {
      const backlog = target.length - shown.length;
      const step = Math.max(3, Math.ceil(backlog / 12));
      let end = shown.length + step;
      // Never split a surrogate pair (emoji) at the edge of the reveal.
      const code = target.charCodeAt(end - 1);
      if (end < target.length && code >= 0xd800 && code <= 0xdbff) end += 1;
      publish(target.slice(0, end));
    } else {
      stopTicker();
      if (done) releaseWaiter();
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => shown,
    push(delta) {
      const first = target === "";
      target += delta;
      startTicker();
      return first;
    },
    finish(full) {
      target = full || target;
      done = true;
      if (shown.length >= target.length) return Promise.resolve(target);
      startTicker();
      return new Promise<string>((resolve) => {
        releaseDrain = () => resolve(target);
      });
    },
    reset() {
      stopTicker();
      releaseWaiter();
      target = "";
      done = false;
      if (shown !== "") publish("");
    },
    dispose() {
      stopTicker();
      releaseWaiter();
    },
  };
}
