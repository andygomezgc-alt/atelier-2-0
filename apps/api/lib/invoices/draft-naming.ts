// apps/api/lib/invoices/draft-naming.ts
// One short text call per invoice for the lines that will become new products: the name the
// bank should show, the category and a suggested kitchen waste with its reason. Anything the
// model answers badly is dropped, and the bank's own defaults apply instead.
import { ProductCategorySchema, type ProductCategory } from "@atelier/shared";
import { generateGlmJson } from "../ai/glm";
import type { UsageCallback } from "../ai/types";

export type DraftNamingRequest = { position: number; description: string; unit: string | null; packQty: number | null; packUnit: string | null };
export type DraftSuggestion = { name: string; category: ProductCategory | null; mermaPct: number | null; mermaReason: string | null };

const MAX_NAME = 120;
const MAX_REASON = 200;
const MAX_MERMA = 90;

const SYSTEM = [
  "Eres el jefe de compras de una cocina profesional. Recibes líneas de facturas de proveedores tal como fueron leídas; cada una será un producto nuevo del banco de productos.",
  "name: el nombre con el que el producto queda en el banco.",
  "- En el idioma de la factura, sin traducir ninguna palabra; mayúscula inicial y el resto en minúsculas, salvo marcas y siglas (IQF).",
  "- El producto y lo que lo distingue para un cocinero: variedad o corte, estado (pulito, sgusciato, congelato, IQF, cotto), calibre o pezzatura (80/150 g, 1-1,5 kg, n. 3) y el formato de compra cuando importa (1 L, 100 g, busta 200 g).",
  "- Sin códigos de artículo, lotes, partidas, nombres científicos, zonas FAO, origen, precios ('al kg'), instrucciones de conservación ni textos como 'vedi etichetta'.",
  "- Expande abreviaturas obvias (PUL → pulita, INS. → insalata, CALAM → calamari).",
  "category: " + ProductCategorySchema.options.join(", ") + " (mariscos y moluscos van en pescado).",
  "wastePct: la merma estimada en cocina, en porcentaje. 0 si se compra ya limpio o listo para usar (pulito, filetti, sgusciato, polpa, purea, carpaccio, panna, envasados).",
  "wasteReason: en pocas palabras y en el idioma de la factura, de dónde sale esa merma (por ejemplo 'guscio e acqua', 'testa, lisca e pelle', 'comprato già pulito').",
].join("\n");

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "number" },
          name: { type: "string" },
          category: { type: "string", enum: ProductCategorySchema.options },
          wastePct: { type: "number" },
          wasteReason: { type: "string" },
        },
        required: ["position", "name", "category", "wastePct", "wasteReason"],
      },
    },
  },
  required: ["items"],
};

function suggestion(answer: Record<string, unknown>): DraftSuggestion | null {
  const name = typeof answer.name === "string" ? answer.name.trim().slice(0, MAX_NAME) : "";
  if (!name) return null;
  const category = ProductCategorySchema.safeParse(answer.category);
  const waste = answer.wastePct;
  const mermaPct = typeof waste === "number" && Number.isFinite(waste) && waste >= 0 && waste <= MAX_MERMA ? Math.round(waste * 10) / 10 : null;
  const reason = typeof answer.wasteReason === "string" ? answer.wasteReason.trim().slice(0, MAX_REASON) : "";
  return { name, category: category.success ? category.data : null, mermaPct, mermaReason: mermaPct !== null && reason ? reason : null };
}

export async function nameDrafts(requests: DraftNamingRequest[], onUsage?: UsageCallback): Promise<Map<number, DraftSuggestion>> {
  const named = new Map<number, DraftSuggestion>();
  if (requests.length === 0) return named;
  const raw = await generateGlmJson({ task: "extraction", system: SYSTEM, schema: SCHEMA, content: JSON.stringify({ lines: requests }), onUsage });
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return named;
  for (const item of items) {
    const answer = (item ?? {}) as Record<string, unknown>;
    if (!requests.some((r) => r.position === answer.position)) continue;
    const parsed = suggestion(answer);
    if (parsed) named.set(answer.position as number, parsed);
  }
  return named;
}
