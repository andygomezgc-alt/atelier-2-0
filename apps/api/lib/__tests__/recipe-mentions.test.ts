import { describe, expect, it } from "vitest";
import { mentionedRecipeIds, recipeSheet } from "../recipe-mentions";

const menu = [
  { id: "chilindron", title: "Cordero al chilindrón reinterpretado" },
  { id: "pochas", title: "Pochas con verduras de la Ribera y guindilla" },
  { id: "chuleton", title: "Chuletón de vaca vieja a la brasa, piquillos confitados" },
  { id: "alcachofas", title: "Alcachofas a la brasa, yema curada y jamón" },
  { id: "gambero", title: "Gambero rosso de Mazara, emulsión de pistacho y lima" },
  { id: "torrija", title: "Torrija de brioche, helado de queso Roncal" },
  { id: "esparragos", title: "Espárragos a la brasa, mayonesa ahumada de piparra" },
];

describe("mentionedRecipeIds", () => {
  it("reconoce el título completo sin importar mayúsculas ni tildes", () => {
    expect(mentionedRecipeIds(menu, ["Hazme una versión vegetariana de nuestra receta CORDERO AL CHILINDRON REINTERPRETADO."]))
      .toEqual(["chilindron"]);
  });

  it("reconoce el nombre del plato aunque el título siga tras la coma", () => {
    expect(mentionedRecipeIds(menu, ["Nuestra receta Gambero rosso de Mazara usa un producto fuera de temporada"]))
      .toEqual(["gambero"]);
  });

  it("reconoce una palabra propia de un solo plato cuando el chef la nombra con artículo", () => {
    expect(mentionedRecipeIds(menu, ["Mejorá el chilindrón para primavera"])).toEqual(["chilindron"]);
    expect(mentionedRecipeIds(menu, ["Dale una vuelta a las torrijas"])).toEqual(["torrija"]);
    expect(mentionedRecipeIds(menu, ["¿Cómo aligero mis pochas?"])).toEqual(["pochas"]);
  });

  it("no toma por mención una palabra propia sin artículo, que suele ser un ingrediente para un plato nuevo", () => {
    expect(mentionedRecipeIds(menu, ["Quiero un entrante con pochas y almejas"])).toEqual([]);
  });

  it("ignora las palabras que comparten varios platos y las que van tras la coma", () => {
    expect(mentionedRecipeIds(menu, ["Algo a la brasa con la lima y el pistacho"])).toEqual([]);
  });

  it("se queda con los tres platos nombrados más recientemente, en orden de primera mención", () => {
    const messages = ["Pensaba en el chilindrón", "y en las pochas", "también el chuletón", "y las alcachofas", "otra vez el chilindrón"];
    expect(mentionedRecipeIds(menu, messages)).toEqual(["chilindron", "chuleton", "alcachofas"]);
    expect(mentionedRecipeIds(menu, messages.slice(0, 2))).toEqual(["chilindron", "pochas"]);
  });
});

describe("recipeSheet", () => {
  const recipe = {
    title: "Pochas  con verduras",
    contentJson: { ingredients: ["500 g de pochas"], method: ["Cocer  las pochas", 7, "Añadir las verduras"] },
    recipeIngredients: [] as { rawText: string }[],
  };

  it("toma los ingredientes de la ficha y la elaboración del contenido, con espacios normalizados", () => {
    expect(recipeSheet(recipe)).toEqual({
      title: "Pochas con verduras",
      ingredients: ["500 g de pochas"],
      method: ["Cocer las pochas", "Añadir las verduras"],
    });
  });

  it("prefiere las líneas de ingredientes guardadas a las del contenido", () => {
    expect(recipeSheet({ ...recipe, recipeIngredients: [{ rawText: "1 kg de pochas de Sangüesa" }] }).ingredients)
      .toEqual(["1 kg de pochas de Sangüesa"]);
  });

  it("acota una ficha muy larga en número de líneas y en longitud de cada línea", () => {
    const sheet = recipeSheet({
      ...recipe,
      contentJson: { ingredients: Array.from({ length: 50 }, (_, i) => `ingrediente ${i}`), method: [`${"paso ".repeat(100)}final`] },
    });
    expect(sheet.ingredients).toHaveLength(30);
    expect(sheet.method[0]!.length).toBeLessThanOrEqual(300);
    expect(sheet.method[0]!.endsWith("…")).toBe(true);
  });
});
