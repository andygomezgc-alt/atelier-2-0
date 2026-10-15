import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { h2Style, pStyle, linkStyle } from "@/components/site";
import { LegalPage, LegalTitle } from "@/components/legal/legal-page";
import {
  LEGAL_PAGE_LOCALES,
  isLegalPageLocale,
  legalMetadata,
  legalPaths,
  type LegalPageLocale,
  type LegalPaths,
} from "@/components/legal/legal-paths";

// Italian and English versions of /cuenta/eliminar. The Spanish page stays at its own URL.
type Props = { params: Promise<{ lang: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return LEGAL_PAGE_LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLegalPageLocale(lang)) return {};
  return legalMetadata("deleteAccount", lang, content[lang]);
}

export default async function DeleteAccountPage({ params }: Props) {
  const { lang } = await params;
  if (!isLegalPageLocale(lang)) notFound();
  const { heading, body } = content[lang];
  return (
    <LegalPage lang={lang}>
      <LegalTitle dated={false}>{heading}</LegalTitle>
      {body(legalPaths(lang))}
    </LegalPage>
  );
}

type Content = { title: string; description: string; heading: string; body: (paths: LegalPaths) => ReactNode };

const content: Record<LegalPageLocale, Content> = {
  it: {
    title: "Eliminare il tuo account — Atelier",
    description: "Come eliminare il tuo account Atelier, dall’app o via email, e cosa viene cancellato.",
    heading: "Eliminare il tuo account Atelier",
    body: (paths) => (
      <>
        <p style={pStyle}>Hai due modi per eliminare il tuo account:</p>

        <h2 style={h2Style}>a) Dall’app</h2>
        <p style={pStyle}>
          Vai su Profilo → Elimina account e conferma l’operazione. Se sei l’ultimo membro del
          ristorante, viene eliminato anche il ristorante con tutti i suoi contenuti. Se sei l’ultimo
          amministratore e restano dei colleghi, nomina prima un altro amministratore. L’app conferma
          quando ha finito; se compare un errore, l’eliminazione non va considerata completata.
        </p>

        <h2 style={h2Style}>b) Senza accesso all’app</h2>
        <p style={pStyle}>
          Scrivi dall’indirizzo email del tuo account a{" "}
          <a
            href="mailto:andygomezgc@gmail.com?subject=Elimina%20account"
            style={linkStyle}
          >
            andygomezgc@gmail.com
          </a>{" "}
          con oggetto «Elimina account» e gestiremo la richiesta entro un massimo di 30 giorni.
        </p>

        <h2 style={h2Style}>Cosa viene cancellato</h2>
        <p style={pStyle}>Il tuo account, il tuo indirizzo email, il tuo nome e la tua foto.</p>

        <h2 style={h2Style}>Cosa può essere conservato</h2>
        <p style={pStyle}>
          Le ricette, le idee, i menu e le conversazioni condivisi con il ristorante possono restare a
          disposizione del team, con l’identificazione del tuo profilo sostituita. Se hai scritto dati
          personali all’interno di questi contenuti, contattaci per verificarli. I registri tecnici e
          le copie cifrate seguono un trattamento separato: la cancellazione non elimina
          automaticamente le copie già create. Trovi maggiori informazioni nell’
          <a href={paths.privacy} style={linkStyle}>informativa sulla privacy</a>.
        </p>
      </>
    ),
  },
  en: {
    title: "Delete your account — Atelier",
    description: "How to delete your Atelier account, from the app or by email, and what is deleted.",
    heading: "Delete your Atelier account",
    body: (paths) => (
      <>
        <p style={pStyle}>There are two ways to delete your account:</p>

        <h2 style={h2Style}>a) From the app</h2>
        <p style={pStyle}>
          Go to Profile → Delete account and confirm. If you are the last member of the restaurant,
          the restaurant is deleted too, with all its content. If you are the last administrator and
          colleagues remain, first appoint another administrator. The app confirms when it is done; if
          an error appears, the deletion should not be considered complete.
        </p>

        <h2 style={h2Style}>b) Without access to the app</h2>
        <p style={pStyle}>
          Write from your account’s email address to{" "}
          <a
            href="mailto:andygomezgc@gmail.com?subject=Delete%20account"
            style={linkStyle}
          >
            andygomezgc@gmail.com
          </a>{" "}
          with the subject “Delete account” and we will process it within 30 days at most.
        </p>

        <h2 style={h2Style}>What is deleted</h2>
        <p style={pStyle}>Your account, your email address, your name and your photo.</p>

        <h2 style={h2Style}>What may be kept</h2>
        <p style={pStyle}>
          Recipes, ideas, menus and conversations shared with the restaurant may remain available to
          the team, with your profile identification replaced. If you wrote personal data inside that
          content, contact us to review it. Technical records and encrypted backups are handled
          separately: deletion does not automatically remove backups already created. You can find
          more information in the{" "}
          <a href={paths.privacy} style={linkStyle}>privacy policy</a>.
        </p>
      </>
    ),
  },
};
