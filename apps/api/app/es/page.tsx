import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { landingJsonLd } from "@/components/landing/jsonld";

export const metadata: Metadata = {
  title: "Atelier — Escandallos, recetas y menús para restaurantes independientes | 49€/mes",
  description:
    "El cuaderno del chef: recetas, escandallos, menús y asistente IA en tu teléfono. 49€/mes + IVA, todo incluido, usuarios ilimitados, sin permanencia.",
  alternates: {
    canonical: "/es",
    languages: { it: "/", es: "/es", "x-default": "/" },
  },
};

export default function EsHomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd("es")) }}
      />
      <LandingPage lang="es" />
    </>
  );
}
