"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./landing.module.css";
import type { Lang } from "./copy";

/**
 * Wrapper cliente: dispara la entrada del hero (data-mounted), observa los
 * [data-reveal] para las apariciones on-scroll y fija el lang del documento
 * (el layout raíz es compartido y quedó en "es").
 */
export function PageFx({ lang, children }: { lang: Lang; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // setTimeout y no rAF: en tabs en segundo plano rAF puede no disparar nunca
    const timer = setTimeout(() => {
      root.setAttribute("data-mounted", "");
    }, 60);

    const targets = Array.from(root.querySelectorAll("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-shown", "");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -60px 0px", threshold: 0.1 },
    );
    targets.forEach((t) => io.observe(t));

    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={ref} lang={lang} className={styles.page}>
      <noscript>
        {/* sin JS, todo lo animado (reveals + hero + mockup) debe verse igual */}
        <style>{`[data-reveal],.${styles.heroIn},.${styles.phoneWrap}{opacity:1 !important;transform:none !important}`}</style>
      </noscript>
      {children}
    </div>
  );
}
