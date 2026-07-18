import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { PageShell, serif, ink, teal, accent, muted } from "@/components/site";

export const metadata: Metadata = {
  title: "Atelier Pro",
  description: "El cuaderno creativo del chef, con asistente IA. 49 €/mes.",
};

const MAILTO_FALLBACK = "mailto:andygomezgc@gmail.com?subject=Atelier%20Pro";

function ctaHref(base: string | undefined, restaurantId: string | undefined) {
  if (!base) return null;
  if (!restaurantId) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}client_reference_id=${encodeURIComponent(restaurantId)}`;
}

const cardStyle: CSSProperties = {
  flex: "1 1 260px",
  background: "#fffdf8",
  border: "1px solid #e8e1d4",
  borderRadius: 12,
  padding: "32px 28px",
  display: "flex",
  flexDirection: "column",
};

const priceStyle: CSSProperties = {
  fontFamily: serif,
  fontSize: 40,
  color: ink,
  lineHeight: 1.1,
  margin: "16px 0 4px",
};

const featureListStyle: CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 14.5,
  lineHeight: 1.9,
  color: ink,
  margin: "20px 0 28px",
  paddingLeft: 20,
};

const buttonStyle: CSSProperties = {
  marginTop: "auto",
  display: "block",
  textAlign: "center",
  background: teal,
  color: "#f9f7f2",
  fontFamily: "system-ui, sans-serif",
  fontSize: 15,
  fontWeight: 600,
  padding: "13px 28px",
  borderRadius: 999,
  textDecoration: "none",
};

export default async function ProPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const { r } = await searchParams;
  const proHref = ctaHref(process.env.STRIPE_PAYMENT_LINK_PRO, r);
  const founderHref = ctaHref(process.env.STRIPE_PAYMENT_LINK_FOUNDER, r);

  return (
    <PageShell maxWidth={760}>
      <h1
        style={{
          fontFamily: serif,
          fontStyle: "italic",
          fontSize: 48,
          color: teal,
          margin: "0 0 12px",
          fontWeight: 500,
        }}
      >
        Atelier Pro
      </h1>
      <p
        style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: 16,
          color: muted,
          margin: "0 0 48px",
          maxWidth: 520,
          lineHeight: 1.6,
        }}
      >
        El cuaderno creativo de tu cocina, con asistente IA. Un plan único, todo
        incluido.
      </p>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "stretch" }}>
        <section style={cardStyle}>
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 13,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: muted,
            }}
          >
            Pro
          </div>
          <div style={priceStyle}>49 €/mes</div>
          <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, color: muted }}>
            + IVA
          </div>
          <ul style={featureListStyle}>
            <li>Asistente IA con uso justo</li>
            <li>Recetas, menús y escandallos ilimitados</li>
            <li>Todo tu equipo, sin coste por usuario</li>
          </ul>
          {proHref ? (
            <a href={proHref} style={buttonStyle}>
              Empezar
            </a>
          ) : (
            <a href={MAILTO_FALLBACK} style={buttonStyle}>
              Escribinos
            </a>
          )}
        </section>

        <section style={{ ...cardStyle, border: `1.5px solid ${accent}` }}>
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 13,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: accent,
            }}
          >
            Socio fundador
          </div>
          <div style={priceStyle}>24,50 €/mes</div>
          <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, color: muted }}>
            + IVA · para siempre
          </div>
          <ul style={featureListStyle}>
            <li>Todo lo del plan Pro</li>
            <li>Precio congelado de por vida</li>
            <li>Limitado a los primeros 10 restaurantes</li>
          </ul>
          {founderHref ? (
            <a href={founderHref} style={{ ...buttonStyle, background: accent }}>
              Empezar
            </a>
          ) : (
            <a href={MAILTO_FALLBACK} style={{ ...buttonStyle, background: accent }}>
              Escribinos
            </a>
          )}
        </section>
      </div>

      <p
        style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          color: muted,
          marginTop: 40,
          textAlign: "center",
        }}
      >
        El pago se gestiona con Stripe. Podés cancelar cuando quieras.
      </p>
    </PageShell>
  );
}
