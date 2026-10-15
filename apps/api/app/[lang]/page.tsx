import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PilotLanding } from "@/components/pilot-landing";
import { LANDING_LOCALES, isLandingLocale, type LandingLocale } from "@/lib/landing-locale";

type Props = { params: Promise<{ lang: string }> };

// Only /it, /es and /en exist; any other single segment is a 404.
export const dynamicParams = false;
export function generateStaticParams() {
  return LANDING_LOCALES.map((lang) => ({ lang }));
}

const meta: Record<LandingLocale, { title: string; description: string }> = {
  it: {
    title: "Atelier · Un quaderno per la tua cucina",
    description: "Idee, ricette e brigata in un unico posto. Scopri Atelier e chiedi l'accesso al pilota per chef su iPhone e Android.",
  },
  es: {
    title: "Atelier · Un cuaderno para tu cocina",
    description: "Ideas, recetas y equipo en un mismo lugar. Conoce Atelier y solicita acceso al piloto para chefs en iPhone y Android.",
  },
  en: {
    title: "Atelier · A notebook for your kitchen",
    description: "Ideas, recipes and your team in one place. Discover Atelier and request access to the pilot for chefs on iPhone and Android.",
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLandingLocale(lang)) return {};
  return {
    ...meta[lang],
    metadataBase: new URL("https://ateliercocina.com"),
    alternates: {
      canonical: `/${lang}`,
      languages: { ...Object.fromEntries(LANDING_LOCALES.map((locale) => [locale, `/${locale}`])), "x-default": "/" },
    },
    openGraph: { ...meta[lang], locale: { it: "it_IT", es: "es_ES", en: "en_US" }[lang], type: "website" },
  };
}

export default async function LandingPage({ params }: Props) {
  const { lang } = await params;
  if (!isLandingLocale(lang)) notFound();
  return <PilotLanding locale={lang} />;
}
