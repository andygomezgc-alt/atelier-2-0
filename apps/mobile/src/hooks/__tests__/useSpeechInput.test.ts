import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, Fragment } from "react";
import { act, create } from "react-test-renderer";

// One native emitter shared by every mounted hook, as on the device.
const h = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    listeners,
    emit(name: string, event?: unknown) {
      for (const fn of [...(listeners.get(name) ?? [])]) fn(event);
    },
    start: vi.fn(),
    stop: vi.fn(),
    onText: { a: vi.fn(), b: vi.fn() },
    onError: { a: vi.fn(), b: vi.fn() },
    api: {} as Record<"a" | "b", ReturnType<typeof import("../useSpeechInput").useSpeechInput>>,
  };
});

vi.mock("../speech-module", async () => {
  const { useEffect, useRef } = await import("react");
  return {
    speech: {
      useSpeechRecognitionEvent: (name: string, listener: (event: unknown) => void) => {
        const ref = useRef(listener);
        ref.current = listener;
        useEffect(() => {
          const callback = (event: unknown) => ref.current(event);
          const set = h.listeners.get(name) ?? new Set();
          set.add(callback);
          h.listeners.set(name, set);
          return () => {
            set.delete(callback);
          };
        }, [name]);
      },
      ExpoSpeechRecognitionModule: {
        requestPermissionsAsync: async () => ({ granted: true }),
        isRecognitionAvailable: () => true,
        start: h.start,
        stop: h.stop,
      },
    },
  };
});

import { mergeDictation, useSpeechInput } from "../useSpeechInput";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ name }: { name: "a" | "b" }) {
  h.api[name] = useSpeechInput({ lang: "es-ES", onText: h.onText[name], onError: h.onError[name] });
  return null;
}

let renderer: ReturnType<typeof create> | null = null;

// Two screens with dictation mounted at once, like Inicio and the assistant tab.
async function mountBoth() {
  await act(async () => {
    renderer = create(
      createElement(Fragment, null, createElement(Probe, { name: "a" }), createElement(Probe, { name: "b" })),
    );
  });
}

const result = (transcript: string) => ({ results: [{ transcript }], isFinal: false });

beforeEach(() => {
  h.listeners.clear();
  vi.clearAllMocks();
});

// The hook keeps the current dictation owner at module level, so screens from an
// earlier test must not stay mounted and answer to it.
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("mergeDictation", () => {
  it("returns the dictated text when nothing was typed", () => {
    expect(mergeDictation("", "pichón con espuma")).toBe("pichón con espuma");
  });

  it("adds the dictated text after what was typed, with one space", () => {
    expect(mergeDictation("Pichón", "con espuma de café")).toBe("Pichón con espuma de café");
  });

  it("ignores spaces and line breaks around the typed text", () => {
    expect(mergeDictation("  Pichón \n", "con espuma")).toBe("Pichón con espuma");
    expect(mergeDictation("  \n", "con espuma")).toBe("con espuma");
  });
});

describe("useSpeechInput with two screens mounted", () => {
  it("writes the dictation, after what was typed, into the screen that started it", async () => {
    await mountBoth();
    await act(async () => {
      await h.api.a.start("Pichón");
    });
    expect(h.start).toHaveBeenCalledWith({ lang: "es-ES", interimResults: true, continuous: false });
    expect(h.api.a.listening).toBe(true);

    act(() => h.emit("result", result("con espuma")));
    expect(h.onText.a).toHaveBeenLastCalledWith("Pichón con espuma");

    act(() => h.emit("end"));
    expect(h.api.a.listening).toBe(false);
  });

  it("leaves the other screen's text alone", async () => {
    await mountBoth();
    await act(async () => {
      await h.api.a.start("");
    });
    act(() => {
      h.emit("result", result("pichón"));
      h.emit("end");
    });
    expect(h.onText.a).toHaveBeenCalledWith("pichón");
    expect(h.onText.b).not.toHaveBeenCalled();
    expect(h.api.b.listening).toBe(false);
  });

  it("shows a dictation error only in the screen that started it", async () => {
    await mountBoth();
    await act(async () => {
      await h.api.a.start("");
    });
    act(() => {
      h.emit("error", { error: "not-allowed" });
      h.emit("end");
    });
    expect(h.onError.a).toHaveBeenCalledWith("permission");
    expect(h.onError.b).not.toHaveBeenCalled();
    expect(h.api.a.listening).toBe(false);
  });

  it("stops writing once its own dictation has ended", async () => {
    await mountBoth();
    await act(async () => {
      await h.api.a.start("");
    });
    act(() => h.emit("end"));
    await act(async () => {
      await h.api.b.start("");
    });
    act(() => h.emit("result", result("brioche")));
    expect(h.onText.b).toHaveBeenCalledWith("brioche");
    expect(h.onText.a).not.toHaveBeenCalled();
  });

  // iOS sends "error" without a following "end" when its native start fails.
  it("stops writing after an error that no end follows", async () => {
    await mountBoth();
    await act(async () => {
      await h.api.a.start("");
    });
    act(() => h.emit("error", { error: "audio-capture" }));
    expect(h.onError.a).toHaveBeenCalledWith("unavailable");
    expect(h.api.a.listening).toBe(false);

    act(() => h.emit("result", result("brioche")));
    expect(h.onText.a).not.toHaveBeenCalled();
  });

  it("hands the dictation over to the screen that starts the microphone last", async () => {
    await mountBoth();
    await act(async () => {
      await h.api.a.start("");
    });
    await act(async () => {
      await h.api.b.start("");
    });
    expect(h.api.a.listening).toBe(false);
    expect(h.api.b.listening).toBe(true);

    act(() => h.emit("result", result("brioche")));
    expect(h.onText.b).toHaveBeenCalledWith("brioche");
    expect(h.onText.a).not.toHaveBeenCalled();
  });
});
