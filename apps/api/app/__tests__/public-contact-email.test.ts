import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicContactSources = [
  "../../components/pilot-landing.tsx",
  "../gracias/page.tsx",
  "../privacidad/page.tsx",
  "../terminos/page.tsx",
  "../cuenta/eliminar/page.tsx",
  "../[lang]/privacy/page.tsx",
  "../[lang]/terms/page.tsx",
  "../[lang]/delete-account/page.tsx",
];

describe("public contact email", () => {
  it.each(publicContactSources)("uses the business mailbox in %s", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const emails = [...new Set(source.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])];

    expect(emails).toEqual(["info@ateliercocina.com"]);
    expect(source).toContain("mailto:info@ateliercocina.com");
  });
});
