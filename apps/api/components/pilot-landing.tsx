import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { Crimson_Pro } from "next/font/google";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { LandingLocale } from "@/lib/landing-locale";
import { landingCopy } from "./landing-copy";
import { LandingStory } from "./landing-story";
import styles from "./pilot-landing.module.css";

// The app's serif, used by the phone in the scroll story.
const crimson = Crimson_Pro({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-crimson" });

function Arrow() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Word({ index, children }: { index: number; children: string }) {
  return (
    <span className={styles.word} style={{ "--i": index } as CSSProperties}>
      <span>{children}</span>
    </span>
  );
}

// Rising words separated by spaces; `start` keeps the stagger going across lines.
function Words({ words, start }: { words: string[]; start: number }) {
  return words.map((word, index) => (
    <Fragment key={index}>{index > 0 && " "}<Word index={start + index}>{word}</Word></Fragment>
  ));
}

function Lines({ lines }: { lines: string[] }) {
  return lines.map((line, index) => (
    <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>
  ));
}

// Same order as the `more` entries in landing-copy.ts.
const moreIcons = [
  <><path pathLength={1} d="M6 21V7h14l15 15-13 13z" /><circle pathLength={1} cx="13.5" cy="14" r="2.5" /></>,
  <><path pathLength={1} d="M10 5h14l7 7v23H10z" /><path pathLength={1} d="M20 30V17m-5 5 5-5 5 5" /></>,
  <><path pathLength={1} d="M6 34 34 6" /><path pathLength={1} d="M22 6h12v12M18 34H6V22" /></>,
  <><circle pathLength={1} cx="8" cy="10" r="2.5" /><circle pathLength={1} cx="20" cy="20" r="2.5" /><circle pathLength={1} cx="32" cy="30" r="2.5" /><path pathLength={1} d="M10 12l8 6M22 22l8 6" /></>,
  <path pathLength={1} d="M20 5C21 15 25 19 35 20C25 21 21 25 20 35C19 25 15 21 5 20C15 19 19 15 20 5Z" />,
  <><rect pathLength={1} x="12" y="4" width="16" height="32" rx="3" /><path pathLength={1} d="M18 31h4" /></>,
];

export function PilotLanding({ locale }: { locale: LandingLocale }) {
  const copy = landingCopy[locale];
  const { first, second, swash } = copy.headline;
  const pilotContact = `mailto:andygomezgc@gmail.com?subject=${encodeURIComponent(copy.mailSubject)}&body=${encodeURIComponent(copy.mailBody)}`;
  return (
    <div lang={locale} className={`${styles.page} ${crimson.variable}`}>
      <a className={styles.skipLink} href="#contenido">{copy.skipLink}</a>
      <header className={styles.header}>
        <Link href={`/${locale}`} className={styles.wordmark} aria-label={copy.homeLabel}><span>A</span>telier</Link>
        <nav className={styles.navigation} aria-label={copy.navLabel}>
          <a href="#como-funciona">{copy.navHow}</a>
          <a href="#plan">{copy.navPlan}</a>
          <LanguageSwitcher locale={locale} label={copy.languageLabel} className={styles.languages} />
          <a href="#piloto" className={styles.navCta}>{copy.navCta} <Arrow /></a>
        </nav>
      </header>

      <main id="contenido">
        <section className={styles.hero} aria-labelledby="titulo">
          <p className={styles.eyebrow}><span className={styles.dot} /> {copy.heroEyebrow}</p>
          <h1 id="titulo" className={styles.headline}>
            <span className={styles.line}><Words words={first} start={0} /></span>
            <span className={styles.line}>
              <Words words={second} start={first.length} />{" "}
              <em className={styles.swashHost}>
                <Words words={swash} start={first.length + second.length} />
                <svg className={styles.swash} viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength={1} d="M4 13 C 80 3, 170 3, 296 9" /></svg>
              </em>
            </span>
          </h1>
          <div className={styles.heroFoot}>
            <div className={styles.heroCopy}>
              <p className={`${styles.intro} ${styles.rise}`} style={{ "--d": 0 } as CSSProperties}>{copy.intro}</p>
              <a href="#piloto" className={`${styles.primaryButton} ${styles.rise}`} style={{ "--d": 120 } as CSSProperties}>{copy.heroCta} <Arrow /></a>
              <p className={`${styles.caption} ${styles.rise}`} style={{ "--d": 120 } as CSSProperties}>{copy.heroCaption}</p>
            </div>
            <a className={`${styles.cue} ${styles.rise}`} style={{ "--d": 240 } as CSSProperties} href="#como-funciona">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 4v15m-6-6 6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {copy.heroCue}
            </a>
          </div>
        </section>

        <LandingStory locale={locale} />

        <section className={styles.moreSection} aria-labelledby="more-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{copy.moreEyebrow}</p>
            <h2 id="more-title"><Lines lines={copy.moreTitle} /></h2>
            <p>{copy.moreText}</p>
          </div>
          <div className={styles.more}>
            {copy.more.map((item, index) => (
              <article key={item.title} className={styles.moreItem} style={{ "--n": index % 3 } as CSSProperties}>
                <svg className={styles.icon} viewBox="0 0 40 40" aria-hidden="true">{moreIcons[index]}</svg>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="plan" className={styles.planSection} aria-labelledby="plan-title">
          <div className={styles.planIntro}>
            <p className={styles.eyebrow}>{copy.planEyebrow}</p>
            <h2 id="plan-title"><Lines lines={copy.planTitle} /></h2>
            <p>{copy.planText}</p>
          </div>
          <div className={styles.planCard}>
            <div className={styles.planName}><h3>{copy.planName}</h3><span>{copy.planPer}</span></div>
            <p className={styles.price}>{copy.price}<span>{copy.priceUnit}</span></p>
            <ul className={styles.features}>
              {copy.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <div className={styles.founder}>
              <span className={styles.noteLabel}>{copy.founderLabel}</span>
              <p><strong>{copy.founderPrice}</strong><br />{copy.founderBefore}<strong>{copy.founderMonths}</strong>{copy.founderAfter}</p>
              <p>{copy.founderLater}<strong>{copy.founderLaterPrice}</strong></p>
            </div>
            <p className={styles.planFootnote}>{copy.planFootnote}</p>
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="faq-title">
          <div><p className={styles.eyebrow}>{copy.faqEyebrow}</p><h2 id="faq-title"><Lines lines={copy.faqTitle} /></h2></div>
          <div className={styles.questions}>
            {copy.faq.map((item) => (
              <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>
            ))}
          </div>
        </section>

        <section id="piloto" className={styles.pilot} aria-labelledby="pilot-title">
          <p className={styles.eyebrow}>{copy.pilotEyebrow}</p>
          <h2 id="pilot-title"><Lines lines={copy.pilotTitle} /></h2>
          <p>{copy.pilotText}</p>
          <a href={pilotContact} className={styles.primaryButton}>{copy.pilotCta} <Arrow /></a>
          <span className={styles.contactHint}>{copy.pilotHint}</span>
          <a className={styles.email} href={pilotContact}>andygomezgc@gmail.com</a>
        </section>
      </main>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>Atelier <span>{copy.footerTagline}</span></span>
        <nav aria-label={copy.legalLabel}><Link href="/privacidad">{copy.privacy}</Link><Link href="/terminos">{copy.terms}</Link><Link href="/cuenta/eliminar">{copy.deleteAccount}</Link></nav>
      </footer>
    </div>
  );
}
