// The public web pages address the user as tú, like the app, never as vos.
// apps/api has no page-rendering setup, so the test reads each page's source,
// leaves the code comments out and looks for a fixed list of voseo forms as whole words.
// The list is not a full voseo detector: a generic check for stressed -á/-ás endings
// would also flag tú futures («podrás», «se eliminará») and words like «más» or «después».
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pages = ["privacidad/page.tsx", "terminos/page.tsx", "cuenta/eliminar/page.tsx"];

// The forms these pages used, the common ones, and the actions these pages talk about
// (accept, cancel, delete, download, ask, contact).
const voseo = [
  "aceptá", "andá", "asigná", "borrá", "borrás", "cancelá", "cargás", "confirmá",
  "consultá", "contactanos", "contanos", "decí", "decís", "descargá", "elegí", "elegís",
  "eliminá", "encontrás", "escribí", "escribinos", "fijate", "guardá", "hacé", "hacés",
  "indicás", "ingresá", "mirá", "necesitás", "pedí", "podés", "poné", "probá", "querés",
  "recibís", "revisá", "sabés", "solicitá", "sos", "tenés", "tocá", "usá", "usás",
  "utilizás", "volvé", "vos",
];

// JS \b only knows ASCII letters, so Unicode letter lookarounds delimit the words.
// NFC on both sides: a page saved with decomposed accents (NFD) still matches.
const voseoWords = new RegExp(`(?<!\\p{L})(?:${voseo.join("|").normalize("NFC")})(?!\\p{L})`, "giu");

// Comments may quote voseo; same stripping as apps/mobile/src/lib/__tests__/react-native-imports.test.ts.
const withoutComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("public web pages avoid the listed voseo forms", () => {
  for (const page of pages) {
    it(`app/${page} has none of the listed voseo forms`, () => {
      const source = withoutComments(readFileSync(new URL(`../${page}`, import.meta.url), "utf8").normalize("NFC"));
      expect(source.match(voseoWords) ?? [], `voseo in app/${page}`).toEqual([]);
    });
  }
});
