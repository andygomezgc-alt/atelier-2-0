import type { Metadata } from "next";
import { PilotLanding } from "@/components/pilot-landing";

export const metadata: Metadata = {
  title: "Atelier · Un cuaderno para tu cocina",
  description: "Ideas, recetas y equipo en un mismo lugar. Conoce Atelier y solicita acceso al piloto para chefs en iPhone y Android.",
};

// El piloto no genera enlaces de contratación, aunque existan variables
// STRIPE_PAYMENT_LINK_* configuradas en el servidor.
export default function ProPage() {
  return <PilotLanding />;
}
