import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { landingJsonLd } from "@/components/landing/jsonld";

export const metadata: Metadata = {
  title: "Atelier — Food cost, ricette e menù per ristoranti indipendenti | 49€/mese",
  description:
    "Il quaderno dello chef: ricette, food cost, menù e assistente IA nel tuo telefono. 49€/mese + IVA, tutto incluso, utenti illimitati, senza vincoli.",
  alternates: {
    canonical: "/",
    languages: { it: "/", es: "/es", "x-default": "/" },
  },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd("it")) }}
      />
      <LandingPage lang="it" />
    </>
  );
}
