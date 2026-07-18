import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, serif, teal, linkStyle, pStyle } from "@/components/site";

export const metadata: Metadata = {
  title: "Gracias — Atelier",
};

export default function GraciasPage() {
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
        ¡Gracias! Tu plan ya está activo.
      </h1>
      <p style={pStyle}>
        Volvé a la app: los cambios se aplican solos en unos segundos.
      </p>
      <p style={{ ...pStyle, marginTop: 32 }}>
        <Link href="/" style={linkStyle}>
          Volver al inicio
        </Link>
      </p>
    </PageShell>
  );
}
