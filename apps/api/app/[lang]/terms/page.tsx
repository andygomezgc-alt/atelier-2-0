import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { h2Style, pStyle, linkStyle } from "@/components/site";
import { LegalDate, LegalPage, LegalTitle } from "@/components/legal/legal-page";
import {
  LEGAL_PAGE_LOCALES,
  isLegalPageLocale,
  legalMetadata,
  type LegalPageLocale,
} from "@/components/legal/legal-paths";

// Italian and English versions of /terminos. The Spanish page stays at its own URL.
type Props = { params: Promise<{ lang: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return LEGAL_PAGE_LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLegalPageLocale(lang)) return {};
  return legalMetadata("terms", lang, content[lang]);
}

export default async function TermsPage({ params }: Props) {
  const { lang } = await params;
  if (!isLegalPageLocale(lang)) notFound();
  const { heading, updated, body } = content[lang];
  return (
    <LegalPage lang={lang}>
      <LegalTitle>{heading}</LegalTitle>
      <LegalDate>{updated}</LegalDate>
      {body}
    </LegalPage>
  );
}

type Content = { title: string; description: string; heading: string; updated: string; body: ReactNode };

const content: Record<LegalPageLocale, Content> = {
  it: {
    title: "Termini del servizio — Atelier",
    description: "Le condizioni del servizio Atelier: abbonamento, contenuti, limiti di uso dell’IA, disponibilità e giurisdizione.",
    heading: "Termini del servizio",
    updated: "Luglio 2026",
    body: (
      <>
        <h2 style={h2Style}>Il servizio</h2>
        <p style={pStyle}>
          Atelier è un servizio B2B per i professionisti della ristorazione: un quaderno creativo per
          ricette, menu e schede di costo, con assistente IA.
        </p>

        <h2 style={h2Style}>Abbonamento</h2>
        <p style={pStyle}>
          L’abbonamento è mensile e puoi disdirlo quando vuoi; l’accesso resta attivo fino alla fine
          del periodo già pagato.
        </p>

        <h2 style={h2Style}>I tuoi contenuti</h2>
        <p style={pStyle}>
          I contenuti creati in Atelier (ricette, menu, prodotti) appartengono al ristorante. Li
          trattiamo solo per fornirti il servizio.
        </p>

        <h2 style={h2Style}>Uso corretto dell’IA</h2>
        <p style={pStyle}>
          L’assistente IA ha dei limiti di utilizzo. Durante la fase pilota, i limiti abituali sono 140
          messaggi quotidiani e 15 creativi per persona ogni sette giorni, soggetti anche al budget
          condiviso del pilota. La disponibilità si può consultare nell’app. I limiti dei futuri
          abbonamenti saranno comunicati prima della sottoscrizione.
        </p>

        <h2 style={h2Style}>Disponibilità</h2>
        <p style={pStyle}>
          Durante il programma pilota non garantiamo la disponibilità assoluta del servizio, anche se
          lavoriamo perché sia sempre operativo.
        </p>

        <h2 style={h2Style}>Contatti e giurisdizione</h2>
        <p style={pStyle}>
          Per qualsiasi domanda:{" "}
          <a href="mailto:info@ateliercocina.com" style={linkStyle}>
            info@ateliercocina.com
          </a>
          . I presenti termini sono regolati dalla legge spagnola e qualsiasi controversia è
          sottoposta alla giurisdizione della Spagna.
        </p>
      </>
    ),
  },
  en: {
    title: "Terms of service — Atelier",
    description: "The terms of the Atelier service: subscription, content, AI usage limits, availability and jurisdiction.",
    heading: "Terms of service",
    updated: "July 2026",
    body: (
      <>
        <h2 style={h2Style}>The service</h2>
        <p style={pStyle}>
          Atelier is a B2B service for hospitality professionals: a creative notebook for recipes,
          menus and recipe costings, with an AI assistant.
        </p>

        <h2 style={h2Style}>Subscription</h2>
        <p style={pStyle}>
          The subscription is monthly and you can cancel it whenever you want; access continues until
          the end of the period already paid.
        </p>

        <h2 style={h2Style}>Your content</h2>
        <p style={pStyle}>
          Content created in Atelier (recipes, menus, products) belongs to the restaurant. We only
          process it to provide the service to you.
        </p>

        <h2 style={h2Style}>Fair use of AI</h2>
        <p style={pStyle}>
          The AI assistant has usage limits. During the pilot, the usual limits are 140 everyday
          messages and 15 creative ones per person every seven days, also subject to the pilot’s
          shared budget. Availability can be checked in the app. The limits of future subscriptions
          will be communicated before you subscribe.
        </p>

        <h2 style={h2Style}>Availability</h2>
        <p style={pStyle}>
          During the pilot programme we do not guarantee absolute availability of the service,
          although we work to keep it running at all times.
        </p>

        <h2 style={h2Style}>Contact and jurisdiction</h2>
        <p style={pStyle}>
          For any questions:{" "}
          <a href="mailto:info@ateliercocina.com" style={linkStyle}>
            info@ateliercocina.com
          </a>
          . These terms are governed by Spanish law and any dispute is subject to the jurisdiction of
          Spain.
        </p>
      </>
    ),
  },
};
