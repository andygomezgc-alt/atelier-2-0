import { afterEach, describe, expect, it, vi } from "vitest";
import { TOUR_CHAPTERS, playTourChapter } from "../landing-tour-playback";
import { landingCopy } from "../landing-copy";

afterEach(() => vi.unstubAllGlobals());

describe("guided tour playback", () => {
  it("preserves seven complete, ordered chapters in every locale", () => {
    expect(TOUR_CHAPTERS).toHaveLength(7);
    for (const copy of Object.values(landingCopy)) {
      expect(copy.story.steps).toHaveLength(TOUR_CHAPTERS.length);
      expect(copy.overview.items).toHaveLength(3);
    }
    expect(TOUR_CHAPTERS.map((chapter) => chapter.end)).toEqual([15, 34.2, 48.9, 57.5, 69, 86.5, 100]);
  });

  function setup() {
    let frame: FrameRequestCallback = () => {};
    const request = vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; });
    const cancel = vi.fn();
    const setProperty = vi.fn();
    vi.stubGlobal("requestAnimationFrame", request);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    return { target: { style: { setProperty } }, request, cancel, setProperty, tick: (time: number) => frame(time) };
  }

  it("plays only the selected chapter, then stops at its final frame", () => {
    const env = setup();
    const done = vi.fn();
    const chapter = TOUR_CHAPTERS[1];
    playTourChapter(env.target, chapter, false, done);
    expect(env.setProperty).toHaveBeenLastCalledWith("--position", String(chapter.start));
    env.tick(100);
    env.tick(100 + chapter.duration / 2);
    expect(Number(env.setProperty.mock.lastCall?.[1])).toBeCloseTo((chapter.start + chapter.end) / 2);
    env.tick(100 + chapter.duration);
    expect(env.setProperty).toHaveBeenLastCalledWith("--position", String(chapter.end));
    expect(done).toHaveBeenCalledOnce();
    expect(env.request).toHaveBeenCalledTimes(3);
  });

  it("repeats from the chapter start and cancels obsolete playback", () => {
    const env = setup();
    const done = vi.fn();
    const stop = playTourChapter(env.target, TOUR_CHAPTERS[0], false, done);
    env.tick(0);
    stop();
    const calls = env.setProperty.mock.calls.length;
    env.tick(10000);
    expect(env.setProperty).toHaveBeenCalledTimes(calls);
    expect(done).not.toHaveBeenCalled();
    expect(env.cancel).toHaveBeenCalled();
    playTourChapter(env.target, TOUR_CHAPTERS[0], false, done);
    expect(env.setProperty).toHaveBeenLastCalledWith("--position", "0");
  });

  it("uses each chapter's static final frame with reduced motion", () => {
    const env = setup();
    for (const chapter of TOUR_CHAPTERS) {
      const done = vi.fn();
      playTourChapter(env.target, chapter, true, done);
      expect(env.setProperty).toHaveBeenLastCalledWith("--position", String(chapter.end));
      expect(done).toHaveBeenCalledOnce();
    }
    expect(env.request).not.toHaveBeenCalled();
  });
});
