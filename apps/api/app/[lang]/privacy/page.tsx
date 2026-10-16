import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { h2Style, pStyle, linkStyle } from "@/components/site";
import { LegalDate, LegalPage, LegalTitle } from "@/components/legal/legal-page";
import {
  LEGAL_PAGE_LOCALES,
  isLegalPageLocale,
  legalMetadata,
  legalPaths,
  type LegalPageLocale,
  type LegalPaths,
} from "@/components/legal/legal-paths";

// Italian and English versions of /privacidad. The Spanish page stays at its own URL.
type Props = { params: Promise<{ lang: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return LEGAL_PAGE_LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLegalPageLocale(lang)) return {};
  return legalMetadata("privacy", lang, content[lang]);
}

export default async function PrivacyPage({ params }: Props) {
  const { lang } = await params;
  if (!isLegalPageLocale(lang)) notFound();
  const { heading, updated, body } = content[lang];
  return (
    <LegalPage lang={lang}>
      <LegalTitle>{heading}</LegalTitle>
      <LegalDate>{updated}</LegalDate>
      {body(legalPaths(lang))}
    </LegalPage>
  );
}

type Content = {
  title: string;
  description: string;
  heading: string;
  updated: string;
  body: (paths: LegalPaths) => ReactNode;
};

const content: Record<LegalPageLocale, Content> = {
  it: {
    title: "Informativa sulla privacy — Atelier",
    description: "Quali dati tratta Atelier, con chi li condivide, per quanto tempo li conserva e come esercitare i tuoi diritti.",
    heading: "Informativa sulla privacy",
    updated: "Ultimo aggiornamento: 13 ottobre 2026",
    body: (paths) => (
      <>
        <h2 style={h2Style}>Titolare del trattamento</h2>
        <p style={pStyle}>
          Andy Gomez —{" "}
          <a href="mailto:andygomezgc@gmail.com" style={linkStyle}>
            andygomezgc@gmail.com
          </a>
          . Per qualsiasi questione relativa ai tuoi dati, scrivi a questo indirizzo email.
        </p>

        <h2 style={h2Style}>Quali dati trattiamo</h2>
        <p style={pStyle}>
          Il tuo indirizzo email, il nome, l’identificativo di accesso con Google o Apple, la foto e
          la descrizione facoltative; il ristorante, la sua città o zona se la indichi, e il tuo ruolo
          nel team; ricette, idee, menu, prodotti, conversazioni e file che carichi. Trattiamo anche
          dati tecnici di sessione, dispositivo, errori e consumo di IA per mantenere il servizio e
          controllare le quote e il budget.
        </p>

        <h2 style={h2Style}>Il tuo team e l’intelligenza artificiale</h2>
        <p style={pStyle}>
          I contenuti del ristorante sono condivisi con i suoi membri in base ai loro permessi. La
          chat Quotidiano utilizza Google Gemini e la chat Creativo utilizza Anthropic Claude.
          Inviamo il messaggio, una parte limitata della conversazione e il contesto culinario
          necessario per rispondere. Tale contesto include il nome del profilo di chi scrive, la città
          o zona se è stata indicata e il mese in corso, per proporre prodotti di stagione. Per
          seguire il filo delle conversazioni lunghe conserviamo un breve riassunto dei messaggi meno
          recenti: lo redige lo stesso fornitore che risponde in quel turno e viene cancellato insieme
          alla conversazione. Z.AI (GLM) elabora le ricette e i documenti o le immagini che scegli di
          analizzare, gli stili dei menu e l’apprendimento delle preferenze culinarie. I costi delle
          ricette sono calcolati con regole, senza inviare all’IA la banca dati dei prezzi per tale
          calcolo.
        </p>
        <p style={pStyle}>
          In Profilo → La nostra cucina puoi indicare lo stile del ristorante, la sua città o zona e
          gestirne la memoria. La memoria culinaria è attiva nei ristoranti nuovi e in quelli che non
          hanno ancora preso alcuna decisione; puoi disattivarla in Profilo → La nostra cucina o con il
          pulsante «Memoria» della chat. Impara dalle ricette in prova o approvate quando ne viene
          caricata una e una volta alla settimana: analizza una selezione limitata di ricette e
          conserva brevi tendenze, condivise dal team. Conta inoltre, senza IA, gli ingredienti che si
          ripetono più spesso in quelle ricette. Puoi correggere le tendenze, escluderle o
          cancellarle. Disattivare la memoria non cancella di per sé le preferenze già salvate. Chi ne
          ha il permesso può salvare dalla chat le «Note dello chef» (fino a 10, di 160 caratteri
          ciascuna): vengono inviate all’assistente come contesto del ristorante, si cancellano una
          alla volta e vengono eliminate insieme al ristorante. Questo contesto orienta le risposte;
          non addestra un modello proprio di Atelier.
        </p>
        <p style={pStyle}>
          Conserviamo un breve registro tecnico delle tendenze pubblicate per verificare gli errori
          dell’apprendimento. Il controllo giornaliero elimina dalla base dati attiva il contenuto di
          tale registro che supera i 30 giorni. Cancellando la memoria si elimina anche tale
          contenuto storico; i registri di consumo sono conservati separatamente.
        </p>

        <h2 style={h2Style}>Con chi lavoriamo</h2>
        <p style={pStyle}>
          Vercel ospita il server e i file; Neon gestisce la base dati; Google e Apple consentono di
          accedere; Anthropic, Google e Z.AI forniscono le funzioni di IA; Sentry riceve diagnostica
          tecnica. Google Drive conserva copie di backup cifrate, con la chiave custodita
          separatamente. Resend viene utilizzato quando occorre inviare email del servizio e Stripe
          quando si utilizzano funzioni di pagamento. Questi fornitori possono agire come
          responsabili del trattamento o come titolari dei propri servizi, a seconda dell’operazione.
        </p>
        <p style={pStyle}>
          Le condizioni delle API sono diverse da quelle delle loro chat per i consumatori. Puoi
          consultare quelle di{" "}
          <a href="https://privacy.claude.com/en/articles/7996875-can-you-delete-data-that-i-sent-via-api" style={linkStyle}>Anthropic</a>,{" "}
          <a href="https://ai.google.dev/gemini-api/terms" style={linkStyle}>Google Gemini</a> e l’
          <a href="https://docs.z.ai/legal-agreement/privacy-policy#data-processing-addendum-for-api-services" style={linkStyle}>accordo per le API di Z.AI</a>.
          L’API Gemini di Atelier ha la fatturazione attiva. Anthropic dichiara di non utilizzare i
          dati delle API per l’addestramento salvo accordi diversi; Google esclude i contenuti dei
          suoi servizi a pagamento dal miglioramento dei prodotti. Z.AI dichiara di elaborare i
          contenuti delle API in tempo reale senza conservarli. Le eccezioni legali e di sicurezza e i
          dati tecnici sono disciplinati dalle condizioni di ciascun fornitore.
        </p>

        <h2 style={h2Style}>Dove vengono trattati i dati</h2>
        <p style={pStyle}>
          Il server di Atelier e la base dati sono configurati in regioni europee. Ciò non significa
          che tutti i fornitori trattino i dati solo in Europa: possono intervenire servizi al di fuori
          dello Spazio economico europeo, compresi gli Stati Uniti e Singapore; Z.AI indica Singapore
          nel suo accordo per le API. I trasferimenti sono soggetti ai meccanismi e alle garanzie
          applicabili dei fornitori, come decisioni di adeguatezza o clausole contrattuali, ove
          previsti. Puoi chiederci informazioni sui destinatari e sulle garanzie applicabili
          all’indirizzo email di contatto.
        </p>

        <h2 style={h2Style}>Base giuridica</h2>
        <p style={pStyle}>
          Trattiamo i dati necessari per fornire le funzioni che utilizzi (esecuzione del contratto).
          Per proteggere gli account, risolvere i malfunzionamenti e prevenire abusi ci basiamo sul
          legittimo interesse a mantenere un servizio sicuro; adempiamo inoltre agli obblighi di legge
          applicabili. Quando un trattamento richiede il consenso, lo chiederemo e potrai revocarlo.
          Non utilizziamo l’IA per prendere decisioni che producono effetti giuridici nei tuoi
          confronti.
        </p>

        <h2 style={h2Style}>Permessi e dati sul tuo telefono</h2>
        <p style={pStyle}>
          Fotocamera, galleria e microfono sono usati per le funzioni che scegli e richiedono i
          permessi del dispositivo. La dettatura può utilizzare i servizi di riconoscimento vocale del
          tuo sistema. Puoi revocare questi permessi nelle relative impostazioni. Salviamo sul
          telefono la sessione e alcune bozze o azioni in sospeso per recuperare il lavoro e
          sincronizzarlo quando torna la connessione. Non includere dati personali sensibili di
          clienti o colleghi nei documenti inviati all’IA.
        </p>

        <h2 style={h2Style}>I tuoi diritti</h2>
        <p style={pStyle}>
          Puoi chiedere l’accesso, la rettifica, la cancellazione, la portabilità, la limitazione o
          l’opposizione al trattamento, ove applicabili, scrivendo all’indirizzo email indicato sopra.
          Puoi proporre reclamo all’autorità di protezione dei dati del tuo Paese; in Italia, il{" "}
          <a href="https://www.garanteprivacy.it/" style={linkStyle}>Garante per la protezione dei dati personali</a>.
          Puoi anche eliminare il tuo account direttamente nell’app (Profilo → Elimina account) o
          seguendo le istruzioni di{" "}
          <Link href={paths.deleteAccount} style={linkStyle}>
            {paths.deleteAccount}
          </Link>
          .
        </p>

        <h2 style={h2Style}>Conservazione</h2>
        <p style={pStyle}>
          Conserviamo i dati dell’account finché utilizzi il servizio. Quando lo elimini, rimuoviamo i
          dati di accesso e del profilo; se restano contributi condivisi con altri membri,
          conserviamo il contenuto del ristorante e sostituiamo l’identificazione del tuo profilo.
          L’eliminazione dell’account non cancella automaticamente i dati personali che hai scritto
          all’interno di ricette o conversazioni: contattaci per verificare tali contenuti. Se sei
          l’ultimo membro, viene eliminato anche il ristorante. L’ultimo amministratore, se ci sono
          altri membri, deve prima nominare un altro amministratore.
        </p>
        <p style={pStyle}>
          I registri di sicurezza e di consumo possono essere conservati finché sono necessari per
          risolvere problemi, controllare la spesa, prevenire abusi o adempiere agli obblighi di
          legge. Le ricette, i menu e i prodotti che cancelli finiscono nel cestino, dove puoi
          recuperarli per 7 giorni; dopodiché vengono eliminati definitivamente. Durante la fase
          pilota conserviamo le copie cifrate per il ripristino e ne valutiamo la necessità alla
          chiusura di questa fase: non vengono eliminate automaticamente quando si cancella un
          account. Una richiesta di cancellazione richiede di verificare anche tali copie e i tempi
          dei fornitori. Le copie non vengono utilizzate per la chat né per apprendere le preferenze.
        </p>

        <h2 style={h2Style}>Cosa non facciamo</h2>
        <p style={pStyle}>
          Non vendiamo i tuoi dati a terzi e non mostriamo pubblicità.
        </p>
      </>
    ),
  },
  en: {
    title: "Privacy policy — Atelier",
    description: "What data Atelier processes, who it shares it with, how long it keeps it and how to exercise your rights.",
    heading: "Privacy policy",
    updated: "Last updated: 13 October 2026",
    body: (paths) => (
      <>
        <h2 style={h2Style}>Data controller</h2>
        <p style={pStyle}>
          Andy Gomez —{" "}
          <a href="mailto:andygomezgc@gmail.com" style={linkStyle}>
            andygomezgc@gmail.com
          </a>
          . For any question about your data, write to that email address.
        </p>

        <h2 style={h2Style}>What data we process</h2>
        <p style={pStyle}>
          Your email address, name, Google or Apple sign-in identifier, and optional photo and
          description; the restaurant, its city or area if you provide it, and your role in the team;
          the recipes, ideas, menus, products, conversations and files you upload. We also process
          technical data about sessions, devices, errors and AI usage to keep the service running and
          to control quotas and the budget.
        </p>

        <h2 style={h2Style}>Your team and artificial intelligence</h2>
        <p style={pStyle}>
          The restaurant’s content is shared with its members according to their permissions. The
          Everyday chat uses Google Gemini and the Creative chat uses Anthropic Claude. We send the
          message, a limited part of the conversation and the culinary context needed to reply. That
          context includes the profile name of the person writing, the city or area if one was given,
          and the current month, to suggest seasonal produce. To keep track of long conversations we
          store a short summary of the oldest messages: it is written by the same provider that
          replies in that turn and is deleted together with the conversation. Z.AI (GLM) processes the
          recipes and the documents or images you choose to analyse, menu styles and the learning of
          culinary preferences. Recipe costs are calculated with rules, without sending the price
          database to the AI for that calculation.
        </p>
        <p style={pStyle}>
          In Profile → Our kitchen you can set the restaurant’s style and its city or area, and manage
          its memory. Culinary memory is on in new restaurants and in those that have not made any
          choice yet; you can turn it off in Profile → Our kitchen or with the chat’s “Memory” button.
          It learns from recipes in test or approved, when one is uploaded and once a week: it analyses
          a limited selection of recipes and stores short trends, shared by the team. It also counts,
          without AI, the ingredients that appear most often in those recipes. You can correct the
          trends, exclude them or delete them. Turning memory off does not by itself delete
          preferences already saved. People with permission can save “Chef’s notes” from the chat (up
          to 10, of 160 characters each): they are sent to the assistant as restaurant context, are
          deleted one by one and are removed together with the restaurant. This context guides
          replies; it does not train a model of Atelier’s own.
        </p>
        <p style={pStyle}>
          We keep a short technical log of published trends to review learning errors. The daily
          review removes from the active database the content of that log that is older than 30 days.
          Deleting the memory also removes that historical content; usage records are kept
          separately.
        </p>

        <h2 style={h2Style}>Who we work with</h2>
        <p style={pStyle}>
          Vercel hosts the server and files; Neon runs the database; Google and Apple provide sign-in;
          Anthropic, Google and Z.AI provide the AI features; Sentry receives technical diagnostics.
          Google Drive stores encrypted backups, with the key kept separately. Resend is used when
          service emails need to be sent and Stripe when payment features are used. These providers
          may act as processors or as controllers of their own services, depending on the operation.
        </p>
        <p style={pStyle}>
          API terms differ from the terms of their consumer chats. You can read those of{" "}
          <a href="https://privacy.claude.com/en/articles/7996875-can-you-delete-data-that-i-sent-via-api" style={linkStyle}>Anthropic</a>,{" "}
          <a href="https://ai.google.dev/gemini-api/terms" style={linkStyle}>Google Gemini</a> and the{" "}
          <a href="https://docs.z.ai/legal-agreement/privacy-policy#data-processing-addendum-for-api-services" style={linkStyle}>Z.AI API agreement</a>.
          Atelier’s Gemini API has billing enabled. Anthropic states that it does not use API data for
          training unless otherwise agreed; Google excludes content from its paid services from
          product improvement. Z.AI states that it processes API content in real time without storing
          it. Legal and security exceptions and technical data are governed by each provider’s terms.
        </p>

        <h2 style={h2Style}>Where data is processed</h2>
        <p style={pStyle}>
          Atelier’s server and database are set up in European regions. That does not mean every
          provider processes data only in Europe: services outside the European Economic Area may be
          involved, including the United States and Singapore; Z.AI names Singapore in its API
          agreement. Transfers are subject to the providers’ applicable mechanisms and safeguards,
          such as adequacy decisions or contractual clauses where applicable. You can ask us about the
          recipients and the applicable safeguards at the contact email.
        </p>

        <h2 style={h2Style}>Legal basis</h2>
        <p style={pStyle}>
          We process the data needed to provide the features you use (performance of the contract).
          To protect accounts, fix faults and prevent abuse we rely on our legitimate interest in
          keeping the service secure; we also comply with applicable legal obligations. When
          processing requires consent, we will ask for it and you can withdraw it. We do not use AI to
          make decisions with legal effects on you.
        </p>

        <h2 style={h2Style}>Permissions and data on your phone</h2>
        <p style={pStyle}>
          Camera, photo library and microphone are used for the features you choose and require the
          device’s permissions. Dictation may use your system’s speech recognition services. You can
          revoke these permissions in the settings. We store the session and some drafts or pending
          actions on the phone to recover your work and sync it when you are back online. Do not
          include sensitive personal data of customers or colleagues in documents sent to the AI.
        </p>

        <h2 style={h2Style}>Your rights</h2>
        <p style={pStyle}>
          You can request access, rectification, erasure, portability, restriction of or objection to
          processing, where applicable, by writing to the email above. You can lodge a complaint with
          the data protection authority of your country; in Italy, the{" "}
          <a href="https://www.garanteprivacy.it/" style={linkStyle}>Garante per la protezione dei dati personali</a>.
          You can also delete your account directly in the app (Profile → Delete account) or by
          following the instructions at{" "}
          <Link href={paths.deleteAccount} style={linkStyle}>
            {paths.deleteAccount}
          </Link>
          .
        </p>

        <h2 style={h2Style}>Retention</h2>
        <p style={pStyle}>
          We keep account data while you use the service. When you delete your account, we remove the
          sign-in and profile data; if contributions shared with other members remain, we keep the
          restaurant’s content and replace your profile identification. Deleting the account does not
          automatically erase personal data you have written inside recipes or conversations: contact
          us to review that content. If you are the last member, the restaurant is deleted too. The
          last administrator of a restaurant with other members must first appoint another
          administrator.
        </p>
        <p style={pStyle}>
          Security and usage records may be kept for as long as they are needed to resolve incidents,
          control spending, prevent abuse or meet legal obligations. Recipes, menus and products you
          delete go to the trash, where you can recover them for 7 days; after that they are
          permanently deleted. During the pilot we keep the encrypted backups for recovery and review
          whether they are needed when that stage ends: they are not purged automatically when an
          account is deleted. An erasure request also requires reviewing those backups and the
          providers’ time limits. The backups are not used for the chat or to learn preferences.
        </p>

        <h2 style={h2Style}>What we don’t do</h2>
        <p style={pStyle}>
          We don’t sell your data to third parties and we don’t show ads.
        </p>
      </>
    ),
  },
};
