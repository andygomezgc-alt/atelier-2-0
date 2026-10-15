// The landing has no page-rendering setup either (see app/__tests__/public-pages-tuteo.test.ts),
// so these checks read the component sources.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const landing = read("pilot-landing.tsx");
const story = read("landing-story.tsx");
const page = landing + story;

describe("pilot landing", () => {
  it("renders the scroll story inside the landing", () => {
    expect(landing).toMatch(/<LandingStory\s*\/>/);
  });

  it("points every in-page link at a section that exists", () => {
    const targets = [...page.matchAll(/href="#([\w-]+)"/g)].map((match) => match[1]);
    const ids = new Set([...page.matchAll(/\bid="([\w-]+)"/g)].map((match) => match[1]));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((target) => !ids.has(target))).toEqual([]);
  });

  it("asks for pilot access by email and links no payment page", () => {
    expect(landing).toContain("mailto:andygomezgc@gmail.com");
    expect(page).not.toMatch(/stripe|payment_link|checkout/i);
  });
});
