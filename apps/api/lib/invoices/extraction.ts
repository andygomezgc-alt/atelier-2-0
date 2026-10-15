// Reads one supplier invoice page (photo or PDF) into structured lines. The
// model only reads; matching to the product bank happens elsewhere. Amounts
// come back in the invoice currency and are stored here in cents.
import { z } from "zod";
import { generateGlmJson } from "../ai/glm";
import { visionParts } from "../ai/media";
import type { UsageCallback } from "../ai/types";
import { logger } from "../logger";

export class InvoiceExtractionError extends Error {}

export type ExtractedInvoiceLine = {
  description: string;
  code: string | null;
  quantity: number | null;
  unit: string | null;
  packQty: number | null;
  packUnit: string | null;
  unitPriceCents: number | null;
  taxRatePct: number | null;
  lineTotalCents: number | null;
};

export type ExtractedInvoicePage = {
  isInvoice: boolean;
  supplierName: string | null;
  supplierTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  netTotalCents: number | null;
  taxTotalCents: number | null;
  grossTotalCents: number | null;
  lines: ExtractedInvoiceLine[];
  droppedLines: number;
};

// Models sometimes answer "12,50" or "€ 7.20" despite the schema. The last
// separator is the decimal one; the other is a thousands separator.
export function parseLenientNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,-]/g, "");
  if (s === "" || s === "-") return null;
  if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const num = z.unknown().transform(parseLenientNumber);
const text = (max: number) =>
  z.unknown().transform((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null));
const cents = (n: number | null) => (n === null ? null : Math.round(n * 100));

const LineSchema = z.object({
  description: z.string().trim().min(1).max(300),
  code: text(60),
  quantity: num,
  unit: text(30),
  packQty: num,
  packUnit: text(30),
  unitPrice: num,
  taxRatePct: num,
  lineTotal: num,
});

const PageSchema = z.object({
  isInvoice: z.boolean().default(true),
  supplierName: text(200),
  supplierTaxId: text(40),
  invoiceNumber: text(60),
  invoiceDate: z.unknown().transform((v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  netTotal: num,
  taxTotal: num,
  grossTotal: num,
  lines: z.array(z.unknown()).max(200).default([]),
});

export function parseInvoicePage(raw: unknown): ExtractedInvoicePage {
  const parsed = PageSchema.safeParse(raw);
  if (!parsed.success) throw new InvoiceExtractionError("invoice_response_invalid");
  const page = parsed.data;
  const lines: ExtractedInvoiceLine[] = [];
  let droppedLines = 0;
  for (const rawLine of page.lines) {
    const line = LineSchema.safeParse(rawLine);
    if (!line.success) {
      droppedLines++;
      continue;
    }
    const l = line.data;
    lines.push({
      description: l.description,
      code: l.code,
      quantity: l.quantity,
      unit: l.unit,
      packQty: l.packQty,
      packUnit: l.packUnit,
      unitPriceCents: cents(l.unitPrice),
      taxRatePct: l.taxRatePct,
      lineTotalCents: cents(l.lineTotal),
    });
  }
  return {
    isInvoice: page.isInvoice,
    supplierName: page.supplierName,
    supplierTaxId: page.supplierTaxId,
    invoiceNumber: page.invoiceNumber,
    invoiceDate: page.invoiceDate,
    netTotalCents: cents(page.netTotal),
    taxTotalCents: cents(page.taxTotal),
    grossTotalCents: cents(page.grossTotal),
    lines,
    droppedLines,
  };
}

const optString = { type: "string" } as const;
const optNumber = { type: "number" } as const;

const INVOICE_PAGE_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    isInvoice: { type: "boolean", description: "false si la imagen no es una factura, albarán o DDT" },
    supplierName: optString,
    supplierTaxId: { ...optString, description: "número fiscal del proveedor (partita IVA, CIF, VAT...)" },
    invoiceNumber: optString,
    invoiceDate: { ...optString, description: "fecha de la factura en formato YYYY-MM-DD" },
    netTotal: { ...optNumber, description: "total sin impuestos (imponible)" },
    taxTotal: optNumber,
    grossTotal: optNumber,
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { ...optString, description: "descripción del artículo tal cual aparece" },
          code: { ...optString, description: "código de artículo si existe" },
          quantity: optNumber,
          unit: { ...optString, description: "unidad tal cual: kg, g, l, pz, cassa, cartone..." },
          packQty: { ...optNumber, description: "contenido de un envase si se indica, ej. 5 en 'cassa 5 kg'" },
          packUnit: { ...optString, description: "unidad del contenido del envase, ej. kg" },
          unitPrice: { ...optNumber, description: "precio unitario sin impuesto" },
          taxRatePct: { ...optNumber, description: "porcentaje de impuesto de la línea, solo si aparece" },
          lineTotal: { ...optNumber, description: "importe de la línea sin impuesto; negativo si es descuento o devolución" },
        },
        required: ["description"],
      },
    },
  },
  required: ["isInvoice", "lines"],
};

const INVOICE_SYSTEM = [
  "Eres un lector de facturas y albaranes de proveedores de restaurantes, de cualquier país e idioma.",
  "Devuelve SOLO lo que está escrito. No inventes datos: si un campo no aparece, omítelo.",
  "Incluye TODAS las líneas de artículos, una por renglón, en el mismo orden, también descuentos y devoluciones.",
  "No incluyas como línea los subtotales, totales ni resúmenes de impuestos.",
  "Los importes son números con punto decimal, sin símbolo de moneda.",
].join("\n");

const RETRY_IF_FIRST_UNDER_MS = 25_000;
const EXTRACTION_DEADLINE_MS = 50_000;

// Broken JSON and provider hiccups (a 400 that passes on the next call, 5xx) get one more attempt.
// Auth, rate-limit and budget errors do not: repeating them cannot help.
const RETRYABLE = /^(?:ai_response_invalid|ai_provider_http_(?:400|5\d\d))$/;

async function generateInvoiceJson(request: Parameters<typeof generateGlmJson>[0]): Promise<unknown> {
  const started = Date.now();
  try {
    return await generateGlmJson(request);
  } catch (error) {
    const elapsedMs = Date.now() - started;
    if (!(error instanceof Error) || !RETRYABLE.test(error.message) || elapsedMs > RETRY_IF_FIRST_UNDER_MS) throw error;
    logger.info("invoice_extraction_retry", { reason: error.message, elapsedMs });
    return generateGlmJson({ ...request, signal: AbortSignal.timeout(EXTRACTION_DEADLINE_MS - elapsedMs) });
  }
}

export async function extractInvoicePage(
  buffer: Uint8Array,
  mimeType: string,
  onUsage?: UsageCallback,
): Promise<ExtractedInvoicePage> {
  const parts = await visionParts(buffer, mimeType);
  const raw = await generateInvoiceJson({
    task: "extraction",
    system: INVOICE_SYSTEM,
    schema: INVOICE_PAGE_JSON_SCHEMA,
    content: [...parts, { type: "text", text: "Extrae los datos de esta factura." }],
    onUsage,
    incompleteCode: "invoice_extraction_incomplete",
  });
  return parseInvoicePage(raw);
}
