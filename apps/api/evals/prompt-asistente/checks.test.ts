import { describe, expect, it } from "vitest";
import { detectLanguage, deterministicGrades, hasHiddenJson, quantityFirstShare, recipeDetected, wordCount } from "./checks";

const RECETA_ES = [
  "Rinde 10 raciones.",
  "",
  "**Ingredientes**",
  "- 1 kg judiones de La Granja",
  "- 200 g chorizo",
  "- 8 g sal fina",
  "",
  "**Método**",
  "1. Pon los judiones en remojo 12 horas.",
  "2. Cuécelos a fuego suave hasta que estén tiernos.",
].join("\n");

const RICETTA_IT = [
  "Per 6 persone.",
  "",
  "## Ingredienti",
  "1. 1,5 kg pesce di scoglio",
  "2. 400 g pomodori pelati",
  "3. ½ limone",
  "",
  "## Procedimento",
  "1. Pulisci il pesce.",
  "2. Cuoci 20 minuti senza mescolare.",
].join("\n");

const RECIPE_EN = [
  "Serves 8.",
  "",
  "Ingredients:",
  "* **150 g** unsalted butter",
  "* 1.2 kg celeriac",
  "* 1.5 l chicken stock",
  "",
  "Method:",
  "1. Brown the butter until it smells of hazelnut.",
  "2. Add the celeriac and simmer for 25 minutes.",
].join("\n");

describe("detectLanguage", () => {
  it("reconoce el español, el italiano y el inglés", () => {
    expect(detectLanguage("El fumet es más corto y concentrado que el caldo: se hace con espinas y cabezas en unos 20 minutos, sin dorar, para que quede limpio.")).toBe("es");
    expect(detectLanguage("Il brodetto è più buono il giorno dopo: il pesce si cuoce per strati, senza mescolare, e il sugo deve restare denso ma non asciutto.")).toBe("it");
    expect(detectLanguage("Brown the butter until it smells of hazelnut, then add the celeriac and cook it gently for ten minutes with the lid on.")).toBe("en");
  });

  it("el voseo sigue siendo español aunque diga «che»", () => {
    expect(detectLanguage("Che, blanqueá la molleja en agua con sal y después dejala enfriar para que no se te deshaga en la parrilla.")).toBe("es");
  });

  it("devuelve unknown cuando no hay un idioma claro", () => {
    expect(detectLanguage("")).toBe("unknown");
    expect(detectLanguage("Ok, perfecto.")).toBe("unknown");
    expect(detectLanguage("El pan y los ajos; il pane e gli agli.")).toBe("unknown");
  });
});

describe("recipeDetected — copia del detector de «Guardar receta»", () => {
  it("detecta los títulos en español, italiano e inglés", () => {
    expect(recipeDetected(RECETA_ES)).toBe(true);
    expect(recipeDetected(RICETTA_IT)).toBe(true);
    expect(recipeDetected(RECIPE_EN)).toBe(true);
  });

  it("no detecta una receta sin títulos", () => {
    expect(recipeDetected("Pon 1 kg de judiones en remojo, cuécelos con chorizo y sirve.")).toBe(false);
  });

  it("no acepta «Metodo» sin tilde", () => {
    expect(recipeDetected(RICETTA_IT.replace("## Procedimento", "## Metodo"))).toBe(false);
  });

  it("exige los dos títulos", () => {
    expect(recipeDetected("**Ingredientes**\n- 4 huevos\n- 8 g sal fina")).toBe(false);
  });
});

describe("quantityFirstShare", () => {
  it("cuenta las líneas de la lista que empiezan por la cantidad", () => {
    const text = ["Ingredientes", "- 4 huevos", "- 8 g sal fina", "- Sal fina, 8 g", "- Sal al gusto", "Método", "1. Batir los huevos."].join("\n");
    expect(quantityFirstShare(text)).toEqual({ lines: 4, share: 0.5 });
  });

  it("acepta decimales con punto o coma, fracciones, listas numeradas y cantidades en negrita", () => {
    expect(quantityFirstShare(RICETTA_IT)).toEqual({ lines: 3, share: 1 });
    expect(quantityFirstShare(RECIPE_EN)).toEqual({ lines: 3, share: 1 });
    expect(quantityFirstShare(RECETA_ES)).toEqual({ lines: 3, share: 1 });
  });

  it("no cuenta los pasos del método ni las etiquetas de grupo", () => {
    const text = ["**Ingredientes**", "- **Para el caldo:**", "- 2 l agua", "- 1 hueso de jamón", "Elaboración", "1. Hervir 2 horas.", "2. Colar."].join("\n");
    expect(quantityFirstShare(text)).toEqual({ lines: 2, share: 1 });
  });

  it("también corta en «Metodo», aunque el detector no lo acepte", () => {
    const text = ["Ingredienti", "- 500 g farina", "- 5 uova", "Metodo", "1. Impasta.", "2. Stendi."].join("\n");
    expect(quantityFirstShare(text)).toEqual({ lines: 2, share: 1 });
  });

  it("sin título de ingredientes no hay líneas", () => {
    expect(quantityFirstShare("4 huevos y 8 g de sal.")).toEqual({ lines: 0, share: 0 });
  });

  it("un ítem entero en negrita es una etiqueta de grupo, no un ingrediente", () => {
    const text = ["**Ingredientes**", "- **Para el caldo**", "- 2 l agua", "- 1 hueso de jamón", "- __Para el sofrito__", "- 1 cebolla", "**Método**", "1. Hervir 2 horas."].join("\n");
    expect(quantityFirstShare(text)).toEqual({ lines: 3, share: 1 });
  });

  it("un ítem con subítems sangrados es una etiqueta de grupo, no un ingrediente", () => {
    const text = [
      "Ingredientes", "- Para el caldo", "  - 2 l agua", "  - 1 hueso de jamón", "- Para el sofrito", "", "    * 1 cebolla", "    * 2 dientes de ajo",
      "- Sal al gusto", "Método", "1. Sofreír.",
    ].join("\n");
    expect(quantityFirstShare(text)).toEqual({ lines: 5, share: 0.8 });
  });
});

describe("deterministicGrades", () => {
  it("califica una receta completa en su idioma", () => {
    expect(deterministicGrades(RECETA_ES, { lang: "es", recipe: true })).toEqual({ idioma: 1, titulos: 1, cantidad: 1, sin_json: 1 });
  });

  it("cantidad es null con menos de 3 ingredientes y 0 si la cantidad no va delante", () => {
    const two = ["Ingredientes", "- 4 huevos", "- 8 g sal fina", "Método", "1. Batir los huevos."].join("\n");
    expect(deterministicGrades(two, { lang: "es", recipe: true }).cantidad).toBeNull();
    const late = ["Ingredientes", "- 4 huevos", "- Sal fina, 8 g", "- Sal al gusto", "Método", "1. Batir."].join("\n");
    expect(deterministicGrades(late, { lang: "es", recipe: true }).cantidad).toBe(0);
  });

  it("sin receta no hay títulos ni cantidad; el idioma y el JSON se miden igual", () => {
    expect(deterministicGrades(`${RECIPE_EN}\n{"title": "Soup"}`, { lang: "es", recipe: false })).toEqual({ idioma: 0, titulos: null, cantidad: null, sin_json: 0 });
  });
});

describe("hasHiddenJson", () => {
  it("detecta un bloque ```json en cualquier parte", () => {
    expect(hasHiddenJson("Receta lista.\n```json\n{\"title\": \"Sopa\"}\n```\nBuen servicio.")).toBe(true);
  });

  it("detecta un objeto o un array JSON al final", () => {
    expect(hasHiddenJson("Receta lista.\n{\"title\": \"Sopa\", \"ingredients\": []}")).toBe(true);
    expect(hasHiddenJson("Receta lista.\n[{\"name\": \"ajo\"}]\n")).toBe(true);
    expect(hasHiddenJson("Listo.\n```\n{\"title\": \"Sopa\"}\n```")).toBe(true);
  });

  it("detecta el bloque oculto <recipe_payload> de versiones anteriores", () => {
    expect(hasHiddenJson("Listo.\n<recipe_payload>{\"title\":\"Sopa\"}</recipe_payload>")).toBe(true);
  });

  it("no confunde una respuesta normal", () => {
    expect(hasHiddenJson(RECETA_ES)).toBe(false);
    expect(hasHiddenJson("Sirve a 65 °C. Ver nota [1]")).toBe(false);
    expect(hasHiddenJson("Mezcla las hierbas al final {opcional}")).toBe(false);
  });
});

describe("wordCount", () => {
  it("cuenta palabras y números, no viñetas", () => {
    expect(wordCount("- 4 huevos\n- 8 g sal fina")).toBe(6);
    expect(wordCount("  Hola,   chef.  ")).toBe(2);
    expect(wordCount("brodetto all'anconetana")).toBe(2);
    expect(wordCount("")).toBe(0);
  });
});
