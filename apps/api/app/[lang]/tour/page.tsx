import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { landingCopy } from "@/components/landing-copy";
import { landingFont } from "@/components/landing-font";
import { LandingPhone } from "@/components/landing-story";
import { LandingTour } from "@/components/landing-tour";
import { isLandingLocale } from "@/lib/landing-locale";
import styles from "@/components/pilot-landing.module.css";
import tourStyles from "@/components/landing-tour.module.css";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLandingLocale(lang)) return {};
  return {
    title: `${landingCopy[lang].tour.title} · Atelier`,
    description: landingCopy[lang].tour.intro,
    alternates: { canonical: `https://ateliercocina.com/${lang}/tour` },
  };
}

export default async function TourPage({ params }: Props) {
  const { lang } = await params;
  if (!isLandingLocale(lang)) notFound();
  const copy = landingCopy[lang];
  return (
    <div lang={lang} className={`${styles.page} ${landingFont.variable}`}>
      <a className={styles.skipLink} href="#contenido">{copy.skipLink}</a>
      <header className={styles.header}>
        <Link href={`/${lang}`} className={styles.wordmark} aria-label={copy.homeLabel}><span>A</span>telier</Link>
        <Link href={`/${lang}`} className={styles.backLink}>← {copy.tour.back}</Link>
      </header>
      <main id="contenido">
        <div className={tourStyles.intro}>
          <p>{copy.tour.eyebrow}</p>
          <h1>{copy.tour.title}</h1>
          <p>{copy.tour.intro}</p>
        </div>
        <LandingTour copy={copy.tour} steps={copy.story.steps}>
          <LandingPhone locale={lang} />
        </LandingTour>
      </main>
    </div>
  );
}
