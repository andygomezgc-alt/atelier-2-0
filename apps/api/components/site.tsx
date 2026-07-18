import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

export const serif =
  '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';

export const ink = "#2a2520";
export const teal = "#1a3a3a";
export const accent = "#c47e4f";
export const muted = "#8b7a6f";

export const h2Style: CSSProperties = {
  fontFamily: serif,
  fontSize: 22,
  color: teal,
  marginTop: 40,
  marginBottom: 12,
  fontWeight: 600,
};

export const pStyle: CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 15,
  lineHeight: 1.7,
  color: ink,
  margin: "0 0 14px",
};

export const linkStyle: CSSProperties = {
  color: accent,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

/**
 * Columna de texto con el wordmark arriba. margin:auto evita que el flex
 * centrado del root layout recorte el contenido cuando la página es más
 * alta que el viewport.
 */
export function PageShell({
  children,
  maxWidth = 640,
}: {
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <main
      style={{
        margin: "auto",
        width: "100%",
        maxWidth,
        padding: "56px 24px 80px",
        boxSizing: "border-box",
        textAlign: "left",
      }}
    >
      <Link
        href="/"
        style={{
          fontFamily: serif,
          fontStyle: "italic",
          fontSize: 28,
          color: teal,
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 40,
        }}
      >
        <span style={{ color: accent }}>A</span>telier
      </Link>
      {children}
    </main>
  );
}
