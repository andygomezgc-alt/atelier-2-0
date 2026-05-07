import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Atelier Culinaire",
  description: "Cuaderno creativo del chef con asistente IA",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily:
            '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
          background: "#f9f7f2",
          color: "#2a2520",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </body>
    </html>
  );
}
