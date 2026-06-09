import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRecipePayload, stripRecipePayload } from "../recipe-payload";

// Mensaje REAL capturado de la DB (cmpcl5vc0000c7kcsvevk0q3z): el modelo
// truncó el <recipe_payload> a mitad del 2º ingrediente, sin cerrar.
const realTruncated = readFileSync(
  join(__dirname, "..", "__fixtures__", "a01-real-truncated.txt"),
  "utf8",
);

describe("parseRecipePayload — A-01 regresión", () => {
  it("recupera título + ingredientes de un <recipe_payload> truncado real", () => {
    const r = parseRecipePayload(realTruncated);
    expect(r).not.toBeNull();
    expect(r!.title).toBe(
      "Sashimi di Ricciola, Leche de Tigre Moras e Lamponi al Shiro Miso",
    );
    expect(r!.ingredients.length).toBeGreaterThanOrEqual(1);
    expect(r!.ingredients[0].rawText).toContain("Ricciola");
    expect(r!.ingredients[0].qty).toBe(90);
    expect(r!.ingredients[0].unit).toBe("g");
  });

  it("no falsos positivos: charla exploratoria sin bloque → null", () => {
    expect(
      parseRecipePayload(
        "Podemos modular la acidez de las moras con la frambuesa…",
      ),
    ).toBeNull();
  });

  it("bloque completo bien cerrado sigue parseando (camino estricto)", () => {
    const ok =
      'Texto visible.\n<recipe_payload>\n{"title":"X","ingredients":[{"rawText":"Sal","qty":null,"unit":null,"pezzatura":null}],"method":["Paso 1"],"notes":"n"}\n</recipe_payload>';
    const r = parseRecipePayload(ok);
    expect(r?.title).toBe("X");
    expect(r?.ingredients.length).toBe(1);
    expect(r?.method).toEqual(["Paso 1"]);
    expect(r?.notes).toBe("n");
  });

  it("título imprescindible: bloque truncado antes del título → null", () => {
    expect(parseRecipePayload("<recipe_payload>\n{\n  ")).toBeNull();
  });

  it("stripRecipePayload oculta el bloque truncado al final — el chef ve solo la prosa", () => {
    const stripped = stripRecipePayload(realTruncated);
    expect(stripped).not.toContain("<recipe_payload>");
    expect(stripped).toContain("Sashimi di Ricciola");
    expect(stripped.startsWith("Certo, Chef")).toBe(true);
  });
});
