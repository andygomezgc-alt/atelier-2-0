// The landing has no page-rendering setup either (see app/__tests__/public-pages-tuteo.test.ts),
// so these checks read the component sources and the copy dictionary.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { it as appItalian } from "@atelier/i18n";
import { CREATIVE_CHAT_LIMIT, DAILY_CHAT_WEEKLY_LIMIT } from "../../lib/ai/budget-policy";
import { LANDING_LOCALES } from "../../lib/landing-locale";
import { legalPaths } from "../legal/legal-paths";
import { landingCopy } from "../landing-copy";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const landing = read("pilot-landing.tsx");
const story = read("landing-story.tsx");
const page = landing + story;

// Every string in the copy, with its path, so an empty one can be named.
function strings(value: unknown, path: string): [string, unknown][] {
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`));
  return [[path, value]];
}

describe("pilot landing", () => {
  it("renders the scroll story inside the landing, in the page language", () => {
    expect(landing).toMatch(/<LandingStory\s+locale=\{locale\}\s*\/>/);
    expect(landing).toContain("lang={locale}");
  });

  it("points every in-page link at a section that exists", () => {
    const targets = [...page.matchAll(/href="#([\w-]+)"/g)].map((match) => match[1]);
    const ids = new Set([...page.matchAll(/\bid="([\w-]+)"/g)].map((match) => match[1]));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((target) => !ids.has(target))).toEqual([]);
  });

  it("keeps the visitor in their language when they go back home", () => {
    expect(landing).not.toMatch(/href="\/"/);
    expect(landing).toContain("href={`/${locale}`}");
  });

  it("links the footer's legal pages in the visitor's language", () => {
    const footer = landing.slice(landing.indexOf("<footer"), landing.indexOf("</footer>"));
    expect(footer).not.toMatch(/href="\//);
    expect(landing).toContain("const legal = legalPaths(locale);");
    for (const link of ["href={legal.privacy}", "href={legal.terms}", "href={legal.deleteAccount}"]) expect(footer).toContain(link);
    expect(legalPaths("es")).toEqual({ privacy: "/privacidad", terms: "/terminos", deleteAccount: "/cuenta/eliminar" });
    expect(legalPaths("it")).toEqual({ privacy: "/it/privacy", terms: "/it/terms", deleteAccount: "/it/delete-account" });
    expect(legalPaths("en")).toEqual({ privacy: "/en/privacy", terms: "/en/terms", deleteAccount: "/en/delete-account" });
  });

  it("asks for pilot access by email and links no payment page", () => {
    expect(landing).toContain("mailto:andygomezgc@gmail.com");
    expect(page).not.toMatch(/stripe|payment_link|checkout/i);
  });

  it("states the AI limits the API actually enforces, in every language", () => {
    const faq = (locale: keyof typeof landingCopy) => landingCopy[locale].faq.map((item) => item.answer).join("\n");
    expect(faq("es")).toContain(`${DAILY_CHAT_WEEKLY_LIMIT} mensajes cotidianos y ${CREATIVE_CHAT_LIMIT} creativos`);
    for (const locale of ["it", "en"] as const) {
      expect(faq(locale)).toContain(String(DAILY_CHAT_WEEKLY_LIMIT));
      expect(faq(locale)).toContain(String(CREATIVE_CHAT_LIMIT));
    }
  });

  it("has every text in Italian, Spanish and English", () => {
    expect(Object.keys(landingCopy).sort()).toEqual([...LANDING_LOCALES].sort());
    // The headline is split into words, and each language needs its own number of them.
    const paths = (locale: keyof typeof landingCopy) =>
      strings(landingCopy[locale], "").filter(([path, value]) => value !== undefined && !path.startsWith(".headline")).map(([path]) => path);
    for (const locale of LANDING_LOCALES) {
      const entries = strings(landingCopy[locale], locale).filter(([, value]) => value !== undefined);
      expect(entries.length).toBeGreaterThan(100);
      // Same keys and list lengths as Spanish, so no screen of the phone is left half empty.
      expect(paths(locale)).toEqual(paths("es"));
      expect(entries.filter(([, value]) => typeof value !== "string" || value.trim() === "").map(([path]) => path)).toEqual([]);
    }
  });

  it("shows the app's own Italian tab names on the phone", () => {
    expect(landingCopy.it.story.tabs).toEqual({
      home: appItalian.tab_inicio,
      assistant: appItalian.tab_asistente,
      recipes: appItalian.tab_recetas,
      menus: appItalian.tab_menus,
      house: appItalian.tab_casa,
    });
  });
});
