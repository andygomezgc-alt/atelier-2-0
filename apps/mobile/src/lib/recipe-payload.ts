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

// Recupera un objeto JSON truncado (el modelo cortó antes de cerrar el
// bloque): recorre con conciencia de strings, conserva hasta el último
// corchete/llave que cerró bien (descarta el último token incompleto) y
// balancea lo que quedó abierto. Mejor título+ingredientes parciales que
// el fallback (título = mensaje del usuario, 0 ingredientes).
function repairTruncatedJson(s: string): string {
  let inStr = false;
  let esc = false;
  let lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "}" || ch === "]") lastSafe = i + 1;
  }
  if (lastSafe < 0) return "";
  let core = s.substring(0, lastSafe).replace(/[\s,]+$/, "");
  // Recalcular qué quedó abierto sobre `core` para cerrarlo en orden.
  const open: string[] = [];
  inStr = false;
  esc = false;
  for (let i = 0; i < core.length; i++) {
    const ch = core[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") open.push(ch);
    else if (ch === "}" || ch === "]") open.pop();
  }
  let closers = "";
  for (let i = open.length - 1; i >= 0; i--)
    closers += open[i] === "{" ? "}" : "]";
  return core + closers;
}

// Extrae el primer payload del texto. null si no hay bloque o el JSON
// recuperado no tiene al menos un título. Si el bloque está truncado (el
// modelo cortó antes de </recipe_payload>), recupera lo que alcanzó a
// emitir — title es lo único imprescindible; ingredients/method/notes:
// lo que haya.
export function parseRecipePayload(text: string): RecipePayload | null {
  const openIdx = text.indexOf(PAYLOAD_OPEN);
  if (openIdx < 0) return null;

  const afterOpen = openIdx + PAYLOAD_OPEN.length;
  const closeIdx = text.indexOf(PAYLOAD_CLOSE, afterOpen);

  const rawBlock =
    closeIdx >= 0
      ? text.substring(afterOpen, closeIdx).trim()
      : repairTruncatedJson(text.substring(afterOpen));
  if (!rawBlock) return null;

  // Limpieza defensiva: a veces Claude pone trailing commas dentro de
  // arrays/objects pese a la instrucción. Las quitamos.
  const sanitized = rawBlock.replace(/,(\s*[\]}])/g, "$1").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(sanitized);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  // title imprescindible: recupera el nombre real aunque el resto se
  // haya truncado. ingredients/method/notes son best-effort.
  if (typeof obj.title !== "string" || obj.title.length === 0) return null;

  const ingredients: IngredientPayload[] = [];
  if (Array.isArray(obj.ingredients)) {
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
        pezzatura:
          typeof r.pezzatura === "string" ? r.pezzatura.slice(0, 100) : null,
      });
    }
  }

  const method: string[] = [];
  if (Array.isArray(obj.method)) {
    for (const step of obj.method as unknown[]) {
      if (typeof step === "string" && step.length > 0) {
        method.push(step.slice(0, 2000));
      }
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
