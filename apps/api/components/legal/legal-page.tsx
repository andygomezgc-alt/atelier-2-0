import type { ReactNode } from "react";
import { PageShell, serif, teal, muted } from "@/components/site";

// Shared presentation of the privacy, terms and delete-account pages in every language.

// The root layout keeps <html lang="es">, so translated pages declare their own language.
// display: contents keeps PageShell as the body's flex item.
export function LegalPage({ lang, children }: { lang: string; children: ReactNode }) {
  return (
    <div lang={lang} style={{ display: "contents" }}>
      <PageShell>{children}</PageShell>
    </div>
  );
}

// `dated` leaves room for the date line below; without it the title sits 32px above the text.
export function LegalTitle({ children, dated = true }: { children: ReactNode; dated?: boolean }) {
  return (
    <h1
      style={{
        fontFamily: serif,
        fontSize: 36,
        color: teal,
        margin: dated ? "0 0 8px" : "0 0 32px",
        fontWeight: 600,
      }}
    >
      {children}
    </h1>
  );
}

export function LegalDate({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, color: muted, margin: "0 0 32px" }}>
      {children}
    </p>
  );
}
