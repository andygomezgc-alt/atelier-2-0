import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Lora } from "next/font/google";

// Serif propia para titulares: Iowan/Palatino no existen en Android.
const lora = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "600"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  // con dominio propio: setear NEXT_PUBLIC_SITE_URL para que canonical/hreflang no apunten a vercel.app
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://atelier-2-0-mu.vercel.app"),
  title: "Atelier Culinaire",
  description: "Cuaderno creativo del chef con asistente IA",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={lora.variable}>
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
