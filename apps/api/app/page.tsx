import Link from "next/link";

const footerLinkStyle = {
  color: "#8b7a6f",
  textDecoration: "none",
  borderBottom: "1px solid #d8d0c2",
  paddingBottom: 1,
} as const;

export default function HomePage() {
  return (
    <main
      style={{
        textAlign: "center",
        padding: "0 32px",
        maxWidth: 480,
      }}
    >
      <div
        style={{
          fontFamily:
            '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
          fontStyle: "italic",
          fontSize: 64,
          lineHeight: 1,
          color: "#1a3a3a",
          marginBottom: 16,
        }}
      >
        <span style={{ color: "#c47e4f" }}>A</span>telier
      </div>
      <p style={{ color: "#8b7a6f", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
        Cuaderno creativo del chef. Disponible en TestFlight.
      </p>
      <nav
        style={{
          marginTop: 48,
          display: "flex",
          gap: 20,
          justifyContent: "center",
          flexWrap: "wrap",
          fontFamily: "system-ui, sans-serif",
          fontSize: 12,
        }}
      >
        <Link href="/pro" style={footerLinkStyle}>
          Pro
        </Link>
        <Link href="/privacidad" style={footerLinkStyle}>
          Privacidad
        </Link>
        <Link href="/terminos" style={footerLinkStyle}>
          Términos
        </Link>
        <Link href="/cuenta/eliminar" style={footerLinkStyle}>
          Eliminar cuenta
        </Link>
      </nav>
    </main>
  );
}
