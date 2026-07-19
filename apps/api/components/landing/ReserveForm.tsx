"use client";

import { useState, type FormEvent } from "react";
import styles from "./landing.module.css";
import type { Lang, LandingCopy } from "./copy";

export function ReserveForm({
  lang,
  copy,
  waHref,
}: {
  lang: Lang;
  copy: LandingCopy["reserve"];
  waHref: string | null;
}) {
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setState("sending");
    try {
      const res = await fetch("/api/reservas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          restaurant: data.get("restaurant"),
          extra: data.get("extra_field"),
          lang,
        }),
      });
      setState(res.ok ? "ok" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className={styles.reserveCard} id="reserva">
      <h2>{copy.title}</h2>
      <p>{copy.subtitle}</p>
      {/* live region persistente: si se monta junto al texto, algunos SR no lo anuncian */}
      <p className={`${styles.formMsg} ${styles.formOk}`} role="status">
        {state === "ok" ? copy.ok : ""}
      </p>
      {state !== "ok" && (
        <form onSubmit={onSubmit}>
          <div className={styles.field}>
            <label htmlFor="reserva-email">{copy.emailLabel}</label>
            <input
              id="reserva-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="reserva-rest">{copy.restaurantLabel}</label>
            <input
              id="reserva-rest"
              name="restaurant"
              type="text"
              autoComplete="organization"
              required
              maxLength={120}
            />
          </div>
          {/* honeypot anti-bots — nombre/label sin semántica para que el autofill no lo llene */}
          <div className={styles.honey} aria-hidden="true">
            <label htmlFor="reserva-extra">Non compilare</label>
            <input
              id="reserva-extra"
              name="extra_field"
              type="text"
              tabIndex={-1}
              autoComplete="one-time-code"
            />
          </div>
          <button
            type="submit"
            className={`${styles.btn} ${styles.btnAccent}`}
            disabled={state === "sending"}
          >
            {state === "sending" ? copy.sending : copy.submit}
          </button>
          {state === "error" && (
            <p className={`${styles.formMsg} ${styles.formErr}`} role="alert">
              {copy.error}
            </p>
          )}
        </form>
      )}
      {waHref && state !== "ok" && (
        <p className={styles.reserveAlt}>
          {copy.whatsappAlt} <a href={waHref}>WhatsApp →</a>
        </p>
      )}
    </div>
  );
}
