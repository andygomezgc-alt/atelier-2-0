// The privacy, terms and delete-account pages exist in Italian and English too.
// apps/api has no page-rendering setup (see public-pages-tuteo.test.ts), so the test reads
// the page sources: every email address and every number in the Spanish page (dates, days,
// limits) must also be in the translation, so no fact is lost or changed on the way.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legalAlternates, legalPaths } from "../../components/legal/legal-paths";

const pages = [
  { spanish: "privacidad", translated: "[lang]/privacy" },
  { spanish: "terminos", translated: "[lang]/terms" },
  { spanish: "cuenta/eliminar", translated: "[lang]/delete-account" },
];

const fileUrl = (page: string) => new URL(`../${page}/page.tsx`, import.meta.url);

const withoutComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const read = (page: string) => withoutComments(readFileSync(fileUrl(page), "utf8"));

const emails = (source: string) => [...new Set(source.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])];
const numbers = (source: string) => [...new Set(source.match(/\b\d+\b/g) ?? [])];

// The Italian and English text of a translated page: its `it:` block, then its `en:` block,
// which ends where the content object closes.
function languageBlocks(source: string) {
  const it = source.indexOf("\n  it: ");
  const en = source.indexOf("\n  en: ");
  const end = source.indexOf("\n};", en);
  expect(it, "an `it:` block").toBeGreaterThan(-1);
  expect(en, "an `en:` block").toBeGreaterThan(it);
  expect(end, "the end of the `en:` block").toBeGreaterThan(en);
  return { it: source.slice(it, en), en: source.slice(en, end) };
}

describe("legal pages in Italian and English", () => {
  for (const { spanish, translated } of pages) {
    describe(translated, () => {
      it("exists, with only it and en as static params", () => {
        expect(existsSync(fileUrl(translated)), `app/${translated}/page.tsx`).toBe(true);
        const source = read(translated);
        expect(source).toContain("export const dynamicParams = false");
        expect(source).toMatch(/generateStaticParams\(\)\s*\{\s*return LEGAL_PAGE_LOCALES\.map/);
        expect(source).toContain("<LegalPage lang={lang}>");
      });

      it("keeps every email address and number of the Spanish page in each language", () => {
        const original = read(spanish);
        const blocks = languageBlocks(read(translated));
        expect(emails(original).length).toBeGreaterThan(0);
        expect(numbers(original).length).toBeGreaterThan(0);
        for (const [lang, text] of Object.entries(blocks)) {
          expect(emails(original).filter((email) => !text.includes(email)), `${lang} emails`).toEqual([]);
          expect(numbers(original).filter((number) => !numbers(text).includes(number)), `${lang} numbers`).toEqual([]);
        }
      });
    });
  }

  it("links the translated privacy page to delete-account in the same language", () => {
    const source = read("[lang]/privacy");
    expect(source).not.toContain("/cuenta/eliminar");
    expect(source).not.toContain("/terminos");
    expect(source.match(/href=\{paths\.deleteAccount\}/g)?.length).toBe(2);
    expect(legalPaths("it").deleteAccount).toBe("/it/delete-account");
    expect(legalPaths("en").deleteAccount).toBe("/en/delete-account");
  });

  it("links the translated delete-account page to privacy in the same language", () => {
    const source = read("[lang]/delete-account");
    expect(source).not.toContain('"/privacidad"');
    expect(source.match(/href=\{paths\.privacy\}/g)?.length).toBe(2);
  });

  it("declares the Spanish page as the es alternate of each translation", () => {
    expect(legalAlternates("privacy")).toEqual({ es: "/privacidad", it: "/it/privacy", en: "/en/privacy" });
    expect(legalAlternates("terms")).toEqual({ es: "/terminos", it: "/it/terms", en: "/en/terms" });
    expect(legalAlternates("deleteAccount")).toEqual({
      es: "/cuenta/eliminar",
      it: "/it/delete-account",
      en: "/en/delete-account",
    });
  });
});
