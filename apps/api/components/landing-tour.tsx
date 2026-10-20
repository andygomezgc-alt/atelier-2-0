"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LandingCopy } from "./landing-copy";
import { playTourChapter, TOUR_CHAPTERS } from "./landing-tour-playback";
import styles from "./landing-tour.module.css";

interface TourProps {
  copy: LandingCopy["tour"];
  steps: LandingCopy["story"]["steps"];
  children: ReactNode;
}

export function LandingTour({ copy, steps, children }: TourProps) {
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const player = useRef<HTMLDivElement>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    const target = player.current;
    const chapter = TOUR_CHAPTERS[step];
    if (!target || !chapter) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const play = () => {
      stop.current();
      setReducedMotion(preference.matches);
      setPlaying(!preference.matches);
      stop.current = playTourChapter(target, chapter, preference.matches, () => setPlaying(false));
    };
    play();
    preference.addEventListener("change", play);
    return () => {
      stop.current();
      preference.removeEventListener("change", play);
    };
  }, [step, run]);

  function selectStep(index: number) {
    if (!TOUR_CHAPTERS[index]) return;
    stop.current();
    setStep(index);
    setRun((value) => value + 1);
  }

  return (
    <div className={styles.tour}>
      <div className={styles.chapters}>
        <ol className={styles.steps} aria-label={copy.stepsLabel}>
          {steps.map((item, index) => (
            <li key={item.title}>
              <button type="button" aria-current={index === step ? "step" : undefined}
                aria-controls="tour-description" onClick={() => selectStep(index)}>
                <span>{String(index + 1).padStart(2, "0")}</span>{item.title}
              </button>
            </li>
          ))}
        </ol>
        <div id="tour-description" className={styles.description} aria-live="polite" aria-atomic="true">
          <p className={styles.count}>{step + 1} {copy.of} {steps.length}</p>
          <h2>{steps[step]?.title}</h2>
          <p>{steps[step]?.text}</p>
        </div>
      </div>
      <div className={styles.preview}>
        <div ref={player}>{children}</div>
        <p className={styles.caption}>{copy.demo}</p>
      </div>
      <div className={styles.controls}>
        <button type="button" disabled={step === 0} onClick={() => selectStep(step - 1)}>← {copy.previous}</button>
        <div className={styles.playControls}>
          <button type="button" disabled={reducedMotion} onClick={() => selectStep(step)}>↻ {copy.repeat}</button>
          <button type="button" disabled={!playing} onClick={() => { stop.current(); setPlaying(false); }}>{copy.pause}</button>
        </div>
        <button type="button" disabled={step === steps.length - 1} onClick={() => selectStep(step + 1)}>{copy.next} →</button>
      </div>
      <noscript><ol>{steps.map((item) => <li key={item.title}><strong>{item.title}</strong> — {item.text}</li>)}</ol></noscript>
    </div>
  );
}
