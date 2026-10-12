// The public web pages address the user as tú, like the app, never as vos.
// apps/api has no page-rendering setup, so the test reads each page's source,
// leaves the code comments out and looks for voseo forms as whole words.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pages = ["privacidad/page.tsx", "terminos/page.tsx", "cuenta/eliminar/page.tsx"];

// The forms these pages used, plus the most common ones.
const voseo = [
  "andá", "asigná", "cargás", "confirmá", "contactanos", "contanos", "elegí", "elegís",
  "encontrás", "escribí", "fijate", "indicás", "mirá", "podés", "probá", "querés",
  "revisá", "sabés", "sos", "tenés", "tocá", "usá", "usás", "utilizás", "vos",
];

// JS \b only knows ASCII letters, so Unicode letter lookarounds delimit the words.
const voseoWords = new RegExp(`(?<!\\p{L})(?:${voseo.join("|")})(?!\\p{L})`, "giu");

// Comments may quote voseo; same stripping as apps/mobile/src/lib/__tests__/react-native-imports.test.ts.
const withoutComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("public web pages address the user as tú", () => {
  for (const page of pages) {
    it(`app/${page} has no voseo`, () => {
      const source = withoutComments(readFileSync(new URL(`../${page}`, import.meta.url), "utf8"));
      expect(source.match(voseoWords) ?? [], `voseo in app/${page}`).toEqual([]);
    });
  }
});
