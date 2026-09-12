import type { Metadata } from "next";
import { PilotLanding } from "@/components/pilot-landing";

export const metadata: Metadata = {
  title: "Atelier · Un cuaderno para tu cocina",
  description: "Ideas, recetas y equipo en un mismo lugar. Conoce Atelier y solicita acceso al piloto para chefs en iPhone y Android.",
};

export default function HomePage() {
  return <PilotLanding />;
}
