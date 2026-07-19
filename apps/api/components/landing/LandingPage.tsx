import Link from "next/link";
import styles from "./landing.module.css";
import { copyByLang, type Lang } from "./copy";
import { PageFx } from "./PageFx";
import { StickyBar } from "./StickyBar";
import { ReserveForm } from "./ReserveForm";

const WA_MESSAGES: Record<Lang, string> = {
  it: "Ciao Andy! Vorrei riservare un posto da Socio Fondatore di Atelier per il mio ristorante ",
  es: "¡Hola Andy! Quiero reservar una plaza de Socio Fundador de Atelier para mi restaurante ",
};

function waLink(lang: Lang): string | null {
  const num = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!num) return null;
  // un placeholder sin dígitos suficientes generaría un wa.me muerto como CTA primario
  const digits = num.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(WA_MESSAGES[lang])}`;
}

function founderSeatsLeft(): number {
  // Number("") === 0 mostraría "quedan 0 de 10" con una env vacía (ya pasó con vercel env add)
  const raw = process.env.NEXT_PUBLIC_FOUNDER_SEATS_LEFT;
  if (!raw?.trim()) return 10;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 10;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.2 14.8l-.3-.2-2.5.7.7-2.5-.2-.3A8 8 0 0 1 12 4Zm-3 4.2c-.2 0-.5 0-.7.3-.2.3-.9.9-.9 2.1 0 1.2.9 2.4 1 2.6.1.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.3.2-.6.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4 0-.5.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5L9.6 8.6c-.2-.4-.4-.4-.6-.4Z"
        fill="#fff"
      />
    </svg>
  );
}

export function LandingPage({ lang }: { lang: Lang }) {
  const c = copyByLang[lang];
  const wa = waLink(lang);
  const seats = founderSeatsLeft();
  // CTA primario: WhatsApp si hay número configurado, si no el formulario
  const ctaHref = wa ?? "#reserva";

  return (
    <PageFx lang={lang}>
      {/* header */}
      <header className={styles.inner}>
        <div className={styles.header}>
          <Link href={lang === "it" ? "/" : "/es"} className={styles.wordmark}>
            <span>A</span>telier
          </Link>
          <nav className={styles.langSwitch} aria-label="Language">
            <a className={styles.langActive} aria-current="page" href={lang === "it" ? "/" : "/es"}>
              {c.langLabel}
            </a>
            <a href={c.otherLangHref}>{c.otherLangLabel}</a>
          </nav>
        </div>
      </header>

      <main>
      {/* S1 hero */}
      <section className={styles.inner}>
        <div className={styles.hero}>
          <div className={styles.heroText}>
            <h1 className={styles.heroIn}>{c.hero.title}</h1>
            <p className={styles.heroIn}>{c.hero.subtitle}</p>
            <div className={styles.heroIn}>
              <div className={styles.ctaRow}>
                <a className={`${styles.btn} ${styles.btnAccent}`} href={ctaHref}>
                  {c.hero.cta}
                </a>
                {wa && (
                  <a className={`${styles.btn} ${styles.btnGhost}`} href="#reserva">
                    {c.reserve.submit}
                  </a>
                )}
              </div>
              <p className={styles.ctaNote}>{c.hero.ctaNote}</p>
            </div>
          </div>

          {/* mockup estilizado — placeholder hasta tener capturas reales */}
          <div className={styles.phoneWrap} aria-hidden="true">
            <div className={styles.phone}>
              <div className={styles.screen}>
                <div className={styles.screenBrand}>
                  <span>A</span>telier
                </div>
                <div className={styles.dishCard}>
                  <div className={styles.dishName}>{c.mockup.dish}</div>
                  {c.mockup.ingredients.map((ing) => (
                    <div key={ing} className={styles.dishRow}>
                      <span>{ing}</span>
                    </div>
                  ))}
                  <div className={styles.dishStats}>
                    <div className={`${styles.stat} ${styles.statCost}`}>
                      {c.mockup.costLabel}
                      <span className={styles.statValue}>{c.mockup.cost}</span>
                    </div>
                    <div className={`${styles.stat} ${styles.statMargin}`}>
                      {c.mockup.marginLabel}
                      <span className={styles.statValue}>{c.mockup.margin}</span>
                    </div>
                  </div>
                  <div className={styles.costBar}>
                    <span className={styles.costFill} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div id="hero-end" />

      {/* S2 franja de confianza */}
      <div className={styles.trust}>
        <div className={styles.trustInner}>
          {c.trust.map((t) => (
            <span key={t}>
              <i className={styles.trustDot} />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* S3 problema */}
      <section className={styles.section}>
        <div className={styles.inner}>
          <h2 className={styles.sectionTitle} data-reveal>
            {c.problem.title}
          </h2>
          <div className={styles.painGrid}>
            {c.problem.pains.map((p, i) => (
              <div key={p.title} className={styles.pain} data-reveal style={{ transitionDelay: `${i * 70}ms` }}>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S4 cómo funciona */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.inner}>
          <h2 className={styles.sectionTitle} data-reveal>
            {c.how.title}
          </h2>
          <div className={styles.steps}>
            {c.how.steps.map((s, i) => (
              <div key={s.title} className={styles.step} data-reveal style={{ transitionDelay: `${i * 70}ms` }}>
                <div className={styles.stepNo}>{i + 1}.</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S5 features → resultados */}
      <section className={styles.section}>
        <div className={styles.inner}>
          <h2 className={styles.sectionTitle} data-reveal>
            {c.features.title}
          </h2>
          <div className={styles.featureGrid}>
            {c.features.items.map((f, i) => (
              <div key={f.title} className={styles.feature} data-reveal style={{ transitionDelay: `${(i % 2) * 70}ms` }}>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S7 precio (S6 testimonio Kokoo entra cuando exista la cita con permiso) */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="precio">
        <div className={styles.inner}>
          <h2 className={styles.sectionTitle} data-reveal>
            {c.pricing.title}
          </h2>
          <div className={styles.priceGrid}>
            <div className={styles.priceCard} data-reveal>
              <div className={styles.priceLabel}>{c.pricing.proLabel}</div>
              <div className={styles.priceValue}>{c.pricing.proPrice}</div>
              <div className={styles.priceVat}>{c.pricing.proVat}</div>
              <ul className={styles.priceList}>
                {c.pricing.proFeatures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <div className={`${styles.priceCard} ${styles.priceCardFounder}`} data-reveal style={{ transitionDelay: "80ms" }}>
              <div className={styles.priceLabel}>{c.pricing.founderLabel}</div>
              <div className={styles.priceValue}>
                <span className={styles.priceAnchor}>{c.pricing.founderAnchor}</span>
                {c.pricing.founderPrice}
              </div>
              <div className={styles.priceVat}>
                {c.pricing.proVat.split("·")[0]?.trim() ?? "+ IVA"} · {c.pricing.founderForever}
              </div>
              <span className={styles.seats}>{c.pricing.founderSeats(seats)}</span>
              <p className={styles.founderWhy}>{c.pricing.founderWhy}</p>
              <a className={`${styles.btn} ${styles.btnAccent}`} href={ctaHref}>
                {c.pricing.cta}
              </a>
              <p className={styles.ctaNote}>{c.pricing.ctaNote}</p>
            </div>
          </div>
          <p className={styles.finePrint} data-reveal>
            {c.pricing.finePrint}
          </p>
        </div>
      </section>

      {/* S8 fundador */}
      <section className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.founderSection}>
            <div className={styles.founderMark} data-reveal aria-hidden="true">
              A
            </div>
            <div className={styles.founderBody}>
              <h2 className={styles.sectionTitle} data-reveal style={{ marginBottom: 18 }}>
                {c.founder.title}
              </h2>
              {c.founder.body.map((p, i) => (
                <p key={i} data-reveal style={{ transitionDelay: `${i * 60}ms` }}>
                  {p}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* S9 FAQ */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.inner}>
          <h2 className={styles.sectionTitle} data-reveal>
            {c.faq.title}
          </h2>
          <div className={styles.faqList} data-reveal>
            {c.faq.items.map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* S10 CTA final + reserva */}
      <section className={styles.finalCta}>
        <div className={styles.inner}>
          <h2 data-reveal>{c.finalCta.title}</h2>
          <div data-reveal style={{ transitionDelay: "80ms" }}>
            <ReserveForm lang={lang} copy={c.reserve} waHref={wa} />
          </div>
        </div>
      </section>

      </main>

      {/* footer */}
      <footer className={styles.footer}>
        <div className={styles.inner}>
          <div className={styles.footerInner}>
            <span>
              <b>Atelier</b> — {c.footer.tagline}
            </span>
            <nav className={styles.footerLinks}>
              <Link href="/privacidad">{c.footer.privacy}</Link>
              <Link href="/terminos">{c.footer.terms}</Link>
              <Link href="/cuenta/eliminar">{c.footer.deleteAccount}</Link>
              <a href="mailto:andygomezgc@gmail.com">Email</a>
            </nav>
          </div>
        </div>
      </footer>

      <StickyBar price={c.sticky.price} cta={c.sticky.cta} href={ctaHref} />

      {wa && (
        <a className={styles.fab} href={wa} aria-label={c.hero.whatsapp}>
          <WhatsAppIcon />
        </a>
      )}
    </PageFx>
  );
}
