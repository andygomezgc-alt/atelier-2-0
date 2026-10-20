// Checkpoints follow the original overlapping storyboard, not seven equal slices.
export const TOUR_CHAPTERS = [
  { start: 0, end: 15, duration: 4400 },
  { start: 15.6, end: 34.2, duration: 6000 },
  { start: 34.8, end: 48.9, duration: 4600 },
  { start: 49.2, end: 57.5, duration: 2600 },
  { start: 58, end: 69, duration: 3600 },
  { start: 70, end: 86.5, duration: 5200 },
  { start: 87, end: 100, duration: 4000 },
] as const;

type Chapter = (typeof TOUR_CHAPTERS)[number];
interface PlaybackTarget {
  style: Pick<CSSStyleDeclaration, "setProperty">;
}

// A single position scrubs the original paused CSS keyframes. No DOM queries,
// duplicate animation definitions, React frame renders, or automatic chapter advance.
export function playTourChapter(
  target: PlaybackTarget,
  chapter: Chapter,
  reducedMotion: boolean,
  onEnd: () => void,
): () => void {
  const seek = (position: number) => target.style.setProperty("--position", String(position));
  if (reducedMotion) {
    seek(chapter.end);
    onEnd();
    return () => {};
  }
  let stopped = false;
  let started: number | undefined;
  let frame = 0;
  seek(chapter.start);
  const tick: FrameRequestCallback = (now) => {
    if (stopped) return;
    started ??= now;
    const progress = Math.min((now - started) / chapter.duration, 1);
    seek(chapter.start + (chapter.end - chapter.start) * progress);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else onEnd();
  };
  frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}
