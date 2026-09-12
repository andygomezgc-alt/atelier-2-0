import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, serif, teal, linkStyle, pStyle } from "@/components/site";
import { checkoutStatus, type CheckoutStatus } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gracias — Atelier",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const messages: Record<CheckoutStatus, { title: string; body: string }> = {
  active: { title: "Tu plan está activo.", body: "El pago está confirmado y tu restaurante ya tiene el plan activo. Puedes volver a Atelier." },
  pending: { title: "Estamos comprobando tu pago.", body: "El pago o la activación todavía están pendientes. Actualiza esta página en unos momentos; no hace falta pagar otra vez." },
  expired: { title: "Este enlace de pago ha caducado.", body: "No confirma una suscripción. Vuelve a Atelier para consultar tu plan antes de iniciar otro pago." },
  inactive: { title: "Tu suscripción no está activa.", body: "Consulta el estado de tu plan en Atelier. Si acabas de pagar, contacta con nosotros antes de repetir el pago." },
  unavailable: { title: "Consulta tu plan en Atelier.", body: "No podemos confirmar un pago desde este enlace. Si ya has pagado, revisa tu plan en la app o contacta con nosotros; no repitas el pago." },
};

export default async function GraciasPage({ searchParams }: { searchParams: Promise<{ session_id?: string | string[] }> }) {
  const params = await searchParams;
  let status: CheckoutStatus = "unavailable";
  try { status = await checkoutStatus(typeof params.session_id === "string" ? params.session_id : undefined); } catch { /* No afirmar éxito si Stripe o la base de datos no responden. */ }
  const message = messages[status];
  return (
    <PageShell maxWidth={520}>
      <h1
        style={{
          fontFamily: serif,
          fontStyle: "italic",
          fontSize: 40,
          color: teal,
          margin: "0 0 16px",
          fontWeight: 500,
        }}
      >
        {message.title}
      </h1>
      <p style={pStyle}>
        {message.body}
      </p>
      <p style={pStyle}><a href="mailto:andygomezgc@gmail.com?subject=Consulta%20de%20pago%20Atelier" style={linkStyle}>Contactar con Atelier</a></p>
      <p style={{ ...pStyle, marginTop: 32 }}>
        <Link href="/" style={linkStyle}>
          Volver al inicio
        </Link>
      </p>
    </PageShell>
  );
}
