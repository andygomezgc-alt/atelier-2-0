// Helpers del import de Google Docs (route /api/recipes/import-gdoc).
// Viven fuera de la route porque Next.js no permite exports extra en
// route.ts, y el regex es la barrera anti-SSRF: NUNCA fetcheamos la URL
// que manda el usuario — solo extraemos el doc ID y construimos nosotros
// la URL de export de Google.

const GDOC_URL_RE =
  /^https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{10,})([/?#]|$)/;

export function parseGDocId(url: string): string | null {
  const m = GDOC_URL_RE.exec(url.trim());
  return m?.[1] ?? null;
}

// format=docx: reusa el parser DOCX (mammoth) del upload normal.
export const gdocExportUrl = (id: string) =>
  `https://docs.google.com/document/d/${id}/export?format=docx`;
