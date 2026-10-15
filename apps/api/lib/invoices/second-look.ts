// apps/api/lib/invoices/second-look.ts
// One short text call per invoice for the lines the bank rules could not settle. The model only
// chooses among the candidates it was given; anything else is discarded.
import { generateGlmJson } from "../ai/glm";
import type { UsageCallback } from "../ai/types";
import type { SecondLookRequest } from "./line-matching";

const SYSTEM = [
  "Comparas líneas de facturas de proveedores con productos del banco de un restaurante.",
  "Para cada línea elige el producto que es el MISMO artículo, o null si ninguno lo es con seguridad.",
  "Calibre, origen o fresco/congelado distintos son productos distintos: en ese caso responde null.",
  "Usa solo los ids de los candidatos de esa misma línea.",
].join("\n");

const SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: { position: { type: "number" }, productId: { type: "string", description: "id del candidato, o null" } },
        required: ["position"],
      },
    },
  },
  required: ["answers"],
};

export async function secondLook(requests: SecondLookRequest[], onUsage?: UsageCallback): Promise<Map<number, string | null>> {
  const picks = new Map<number, string | null>();
  if (requests.length === 0) return picks;
  const raw = await generateGlmJson({ task: "extraction", system: SYSTEM, schema: SCHEMA, content: JSON.stringify({ lines: requests }), onUsage });
  const answers = (raw as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers)) return picks;
  for (const answer of answers) {
    const { position, productId } = (answer ?? {}) as { position?: unknown; productId?: unknown };
    const request = requests.find((r) => r.position === position);
    if (!request) continue;
    picks.set(request.position, typeof productId === "string" && request.candidates.some((c) => c.id === productId) ? productId : null);
  }
  return picks;
}
