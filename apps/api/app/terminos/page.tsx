import type { Metadata } from "next";
import { PageShell, serif, teal, muted, h2Style, pStyle, linkStyle } from "@/components/site";

export const metadata: Metadata = {
  title: "Términos del servicio — Atelier",
};

export default function TerminosPage() {
  return (
    <PageShell>
      <h1
        style={{
          fontFamily: serif,
          fontSize: 36,
          color: teal,
          margin: "0 0 8px",
          fontWeight: 600,
        }}
      >
        Términos del servicio
      </h1>
      <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, color: muted, margin: "0 0 32px" }}>
        Julio 2026
      </p>

      <h2 style={h2Style}>El servicio</h2>
      <p style={pStyle}>
        Atelier es un servicio B2B para profesionales de la restauración: un
        cuaderno creativo para recetas, menús y escandallos, con asistente IA.
      </p>

      <h2 style={h2Style}>Suscripción</h2>
      <p style={pStyle}>
        La suscripción es mensual y podés cancelarla cuando quieras; el acceso
        se mantiene hasta el final del período ya pagado.
      </p>

      <h2 style={h2Style}>Tu contenido</h2>
      <p style={pStyle}>
        El contenido creado en Atelier (recetas, menús, productos) pertenece al
        restaurante. Nosotros solo lo tratamos para prestarte el servicio.
      </p>

      <h2 style={h2Style}>Uso justo de la IA</h2>
      <p style={pStyle}>
        El asistente IA está incluido bajo una política de uso justo, con un
        límite diario razonable pensado para el uso normal de una cocina.
      </p>

      <h2 style={h2Style}>Disponibilidad</h2>
      <p style={pStyle}>
        Durante el programa piloto no garantizamos disponibilidad absoluta del
        servicio, aunque trabajamos para que esté siempre operativo.
      </p>

      <h2 style={h2Style}>Contacto y jurisdicción</h2>
      <p style={pStyle}>
        Para cualquier consulta:{" "}
        <a href="mailto:andygomezgc@gmail.com" style={linkStyle}>
          andygomezgc@gmail.com
        </a>
        . Estos términos se rigen por la legislación española y cualquier
        disputa se somete a la jurisdicción de España.
      </p>
    </PageShell>
  );
}
