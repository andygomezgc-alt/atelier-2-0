// Parser y stripper para el bloque <recipe_payload> que Claude emite al
// proponer una receta concreta (Fase 4 del Banco de Productos).
//
// El bloque es JSON oculto al final del mensaje del asistente. Lo usamos
// para pre-llenar el formulario de "Guardar como receta" enlazando los
// ingredientes con el banco. El chef NO debe ver el bloque en el chat —
// stripRecipePayload() lo remueve para display.
//
// Validación manual sin Zod — mobile no tiene la dependencia y la shape
// es simple. Si falta o el tipo es incorrecto, devolvemos null y el caller
// cae al fallback.

export type IngredientPayload = {
  rawText: string;
  qty: number | null;
  unit: string | null;
  pezzatura: string | null;
};

export type RecipePayload = {
  title: string;
  ingredients: IngredientPayload[];
  method: string[];
  notes: string;
};

const PAYLOAD_OPEN = "<recipe_payload>";
const PAYLOAD_CLOSE = "</recipe_payload>";

// Strippea el bloque del texto para mostrarlo en la UI. También strippea
// un bloque "a medio cerrar" si todavía está streaming (evita que el chef
// vea fragmentos de JSON apareciendo).
export function stripRecipePayload(text: string): string {
  // Bloques completos.
  let cleaned = text.replace(
    /<recipe_payload>[\s\S]*?<\/recipe_payload>/g,
    "",
  );
  // Bloque iniciado pero no cerrado (durante streaming).
  const openIdx = cleaned.indexOf(PAYLOAD_OPEN);
  if (openIdx >= 0) cleaned = cleaned.substring(0, openIdx);
  return cleaned.trim();
}

function isStringOrNullish(v: unknown): v is string | null | undefined {
  return v === null || v === undefined || typeof v === "string";
}

function isNumberOrNullish(v: unknown): v is number | null | undefined {
  return v === null || v === undefined || (typeof v === "number" && Number.isFinite(v));
}

// Extrae el primer payload válido del texto. null si no hay bloque, JSON
// inválido, o no matchea la shape esperada.
export function parseRecipePayload(text: string): RecipePayload | null {
  const openIdx = text.indexOf(PAYLOAD_OPEN);
  if (openIdx < 0) return null;
  const closeIdx = text.indexOf(PAYLOAD_CLOSE, openIdx + PAYLOAD_OPEN.length);
  if (closeIdx < 0) return null;

  const raw = text.substring(openIdx + PAYLOAD_OPEN.length, closeIdx).trim();
  if (!raw) return null;

  // Limpieza defensiva: a veces Claude pone trailing commas dentro de
  // arrays/objects pese a la instrucción. Las quitamos.
  const sanitized = raw.replace(/,(\s*[\]}])/g, "$1").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(sanitized);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.title !== "string" || obj.title.length === 0) return null;
  if (!Array.isArray(obj.ingredients)) return null;
  if (!Array.isArray(obj.method)) return null;

  const ingredients: IngredientPayload[] = [];
  for (const raw of obj.ingredients as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.rawText !== "string" || r.rawText.length === 0) continue;
    if (!isNumberOrNullish(r.qty)) continue;
    if (!isStringOrNullish(r.unit)) continue;
    if (!isStringOrNullish(r.pezzatura)) continue;
    ingredients.push({
      rawText: r.rawText.slice(0, 500),
      qty: typeof r.qty === "number" ? r.qty : null,
      unit: typeof r.unit === "string" ? r.unit.slice(0, 50) : null,
      pezzatura: typeof r.pezzatura === "string" ? r.pezzatura.slice(0, 100) : null,
    });
  }

  const method: string[] = [];
  for (const step of obj.method as unknown[]) {
    if (typeof step === "string" && step.length > 0) {
      method.push(step.slice(0, 2000));
    }
  }

  const notes =
    typeof obj.notes === "string" ? obj.notes.slice(0, 5000) : "";

  return {
    title: obj.title.slice(0, 200),
    ingredients,
    method,
    notes,
  };
}
