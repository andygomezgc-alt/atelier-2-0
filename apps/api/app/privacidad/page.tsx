import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, serif, teal, muted, h2Style, pStyle, linkStyle } from "@/components/site";

export const metadata: Metadata = {
  title: "Política de privacidad — Atelier",
};

export default function PrivacidadPage() {
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
        Política de privacidad
      </h1>
      <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, color: muted, margin: "0 0 32px" }}>
        Última actualización: julio 2026
      </p>

      <h2 style={h2Style}>Responsable</h2>
      <p style={pStyle}>
        Andy Gomez —{" "}
        <a href="mailto:andygomezgc@gmail.com" style={linkStyle}>
          andygomezgc@gmail.com
        </a>
        . Para cualquier cuestión sobre tus datos, escribí a ese email.
      </p>

      <h2 style={h2Style}>Qué datos tratamos</h2>
      <p style={pStyle}>
        Tu email, tu nombre, una foto de perfil opcional y el contenido que
        creás en Atelier: recetas, menús, productos y las conversaciones con el
        asistente.
      </p>

      <h2 style={h2Style}>Con quién trabajamos</h2>
      <p style={pStyle}>
        Usamos proveedores que actúan como encargados del tratamiento: Vercel
        (hosting y almacenamiento, UE — región fra1), Neon (base de datos),
        Anthropic (procesamiento IA de los contenidos que enviás al asistente),
        Resend (emails de acceso), Stripe (pagos) y Sentry (errores técnicos).
      </p>

      <h2 style={h2Style}>Base legal</h2>
      <p style={pStyle}>
        Tratamos tus datos porque son necesarios para prestarte el servicio
        (ejecución de contrato).
      </p>

      <h2 style={h2Style}>Tus derechos</h2>
      <p style={pStyle}>
        Podés ejercer tus derechos de acceso, rectificación, supresión y
        portabilidad (GDPR) escribiendo al email de arriba. También podés
        eliminar tu cuenta directamente en la app (Perfil → Eliminar cuenta) o
        siguiendo las instrucciones de{" "}
        <Link href="/cuenta/eliminar" style={linkStyle}>
          /cuenta/eliminar
        </Link>
        .
      </p>

      <h2 style={h2Style}>Retención</h2>
      <p style={pStyle}>
        Conservamos tus datos hasta que eliminás tu cuenta.
      </p>

      <h2 style={h2Style}>Lo que no hacemos</h2>
      <p style={pStyle}>
        No vendemos tus datos a terceros y no mostramos publicidad.
      </p>
    </PageShell>
  );
}
