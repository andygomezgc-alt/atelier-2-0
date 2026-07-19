"use client";

import { useEffect, useState } from "react";
import styles from "./landing.module.css";

/**
 * Barra fija inferior: aparece al scrollear más allá del hero y se esconde
 * cuando el formulario de reserva está a la vista (para no taparlo).
 */
export function StickyBar({
  price,
  cta,
  href,
}: {
  price: string;
  cta: string;
  href: string;
}) {
  const [pastHero, setPastHero] = useState(false);
  const [reserveVisible, setReserveVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero-end");
    const reserve = document.getElementById("reserva");

    // el callback recibe records en lote: el último es el estado vigente
    const ioHero = hero
      ? new IntersectionObserver((entries) => {
          const e = entries[entries.length - 1];
          if (e) setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0);
        })
      : null;
    const ioReserve = reserve
      ? new IntersectionObserver((entries) => {
          const e = entries[entries.length - 1];
          if (e) setReserveVisible(e.isIntersecting);
        })
      : null;

    if (hero && ioHero) ioHero.observe(hero);
    if (reserve && ioReserve) ioReserve.observe(reserve);
    return () => {
      ioHero?.disconnect();
      ioReserve?.disconnect();
    };
  }, []);

  const shown = pastHero && !reserveVisible;

  return (
    <div className={`${styles.sticky} ${shown ? styles.stickyShown : ""}`} aria-hidden={!shown}>
      <div className={styles.stickyInner}>
        <span className={styles.stickyPrice}>{price}</span>
        <a className={`${styles.btn} ${styles.btnAccent}`} href={href} tabIndex={shown ? 0 : -1}>
          {cta}
        </a>
      </div>
    </div>
  );
}
