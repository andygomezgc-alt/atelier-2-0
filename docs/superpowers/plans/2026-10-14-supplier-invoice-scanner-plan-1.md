# Supplier Invoice Scanner — Plan 1 (foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything the invoice scanner needs that does not depend on the real-invoice feasibility gate: invoice reading + totals check + a spike script to run the gate, product attributes and the `ambiguo` match level (with the mobile variant picker), the invoice data model, tax in recipe cost, and the pure pricing rules.

**Architecture:** Pure, tested modules under `apps/api/lib/invoices/` (`extraction.ts`, `totals.ts`, `pricing.ts`) that Plan 2's routes will call. Attributes live in `packages/shared/src/atributos.ts` (ported from `0e853af`). Matching gains `ambiguo` in `apps/api/lib/products/matching.ts`. The data model is a hand-saved Prisma migration. Recipe cost applies the product tax rate inside `computeRecipeCost`.

**Tech Stack:** TypeScript, Next.js 15 API, Prisma/PostgreSQL, Zod 3, vitest (api, shared, mobile), Expo/React Native, Z.ai GLM via `generateGlmJson`.

**Spec:** `docs/superpowers/specs/2026-10-14-supplier-invoice-scanner-design.md`

**Out of scope (Plan 2, written after the gate):** upload/read/apply routes, background execution, private file storage, supplier memory lookups, the AI second look, invoice screens, the product-form tax field, price history linking, and trash purge for invoices.

## Global Constraints

- Price rule: change under 20% pre-selected; 20% or more needs explicit tick (`BIG_CHANGE_PCT = 20`).
- Unsafe unit conversion → no price proposed (`null`), never a guess.
- An invoice older than the product's current price date never overwrites the price.
- `precioCompra` stays net (cents); `Product.taxRatePct` default 0; existing recipe costs must not change while every rate is 0.
- A tax rate the model did not read stays `null` — never default to any country's rate.
- Roles: invoices use the existing `manage_products` permission (admin, chef_executive, sous_chef). No new permission.
- Port the old branch by hand; never merge `origin/feat/escaner-facturas`.
- Mobile tests are `.ts` files under `src/**/__tests__/` using `createElement` (vitest, node env). i18n keys go in `es.ts`, `en.ts` and `it.ts`.
- Commits: Conventional Commits, no AI attribution lines (user rule).

## Review Focus

1. **Comma decimals and currency symbols from the model** (`"12,50"`, `"€ 7.20"`, `"1.234,50"`) → read as numbers, not dropped or crashing. Pinned in Task 1.
2. **Delivery notes with no prices or quantities** (DDT lines with only description) → lines kept with `null` prices; no price proposed, no crash. Pinned in Tasks 1 and 8.
3. **Discount, deposit or return lines with negative totals** (`sconto`, `reso vuoti`) → included in the totals check and never proposed as a product price. Pinned in Tasks 2 and 8.
4. **An extracted line that is malformed** (empty description, a string where an object is expected) → that line is dropped and counted, while the rest of the page survives. Pinned in Task 1.
5. **Invoice dated the same day as the current price** → it still updates (only strictly older invoices are blocked). Pinned in Task 8.

---

### Task 1: Invoice page extraction

**Files:**
- Create: `apps/api/lib/invoices/extraction.ts`
- Test: `apps/api/lib/invoices/extraction.test.ts`

**Interfaces:**
- Consumes: `generateGlmJson` (`apps/api/lib/ai/glm.ts:21`), `visionParts(buffer, mimeType)` (`apps/api/lib/ai/media.ts:9`), `UsageCallback` (`apps/api/lib/ai/types`), `logger` (`apps/api/lib/logger`).
- Produces:
  - `parseLenientNumber(v: unknown): number | null`
  - `type ExtractedInvoiceLine = { description: string; code: string | null; quantity: number | null; unit: string | null; packQty: number | null; packUnit: string | null; unitPriceCents: number | null; taxRatePct: number | null; lineTotalCents: number | null }`
  - `type ExtractedInvoicePage = { isInvoice: boolean; supplierName: string | null; supplierTaxId: string | null; invoiceNumber: string | null; invoiceDate: string | null /* YYYY-MM-DD */; netTotalCents: number | null; taxTotalCents: number | null; grossTotalCents: number | null; lines: ExtractedInvoiceLine[]; droppedLines: number }`
  - `parseInvoicePage(raw: unknown): ExtractedInvoicePage` (throws `InvoiceExtractionError("invoice_response_invalid")`)
  - `extractInvoicePage(buffer: Uint8Array, mimeType: string, onUsage?: UsageCallback): Promise<ExtractedInvoicePage>`
  - `class InvoiceExtractionError extends Error`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/lib/invoices/extraction.test.ts
// Invoice page reading. The provider is mocked: these tests cover the request
// each call builds, lenient number parsing and per-line validation.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { glm } = vi.hoisted(() => ({ glm: { generateGlmJson: vi.fn() } }));
vi.mock("../ai/glm", () => glm);
vi.mock("../ai/media", () => ({
  visionParts: vi.fn(async () => [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }]),
}));

import {
  InvoiceExtractionError,
  extractInvoicePage,
  parseInvoicePage,
  parseLenientNumber,
} from "./extraction";

const PAGE = {
  isInvoice: true,
  supplierName: "Pescheria Mazara",
  supplierTaxId: "IT01234567890",
  invoiceNumber: "123/A",
  invoiceDate: "2026-10-12",
  netTotal: 52.5,
  taxTotal: 5.25,
  grossTotal: 57.75,
  lines: [
    { description: "Gamb.rosso mazara cal.3", code: "GR3", quantity: 1, unit: "cassa", packQty: 5, packUnit: "kg", unitPrice: 40, taxRatePct: 10, lineTotal: 40 },
    { description: "Limoni", quantity: 2, unit: "kg", unitPrice: "6,25", taxRatePct: 4, lineTotal: "12,50" },
  ],
};

beforeEach(() => {
  glm.generateGlmJson.mockReset();
  glm.generateGlmJson.mockResolvedValue(PAGE);
});

describe("parseLenientNumber", () => {
  it.each([
    [12.5, 12.5],
    ["12,50", 12.5],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["€ 7.20", 7.2],
    ["-3,00", -3],
    ["", null],
    ["abc", null],
    [null, null],
    [undefined, null],
  ])("%j -> %j", (input, expected) => {
    expect(parseLenientNumber(input)).toBe(expected);
  });
});

describe("parseInvoicePage", () => {
  it("converts amounts to cents and keeps the raw unit and pack", () => {
    const page = parseInvoicePage(PAGE);
    expect(page.netTotalCents).toBe(5250);
    expect(page.grossTotalCents).toBe(5775);
    expect(page.lines[0]).toEqual({
      description: "Gamb.rosso mazara cal.3", code: "GR3", quantity: 1, unit: "cassa",
      packQty: 5, packUnit: "kg", unitPriceCents: 4000, taxRatePct: 10, lineTotalCents: 4000,
    });
    expect(page.lines[1]!.unitPriceCents).toBe(625);
    expect(page.lines[1]!.lineTotalCents).toBe(1250);
  });

  it("keeps a delivery-note line without prices, with nulls", () => {
    const page = parseInvoicePage({ ...PAGE, lines: [{ description: "Vongole veraci" }] });
    expect(page.lines).toEqual([{
      description: "Vongole veraci", code: null, quantity: null, unit: null, packQty: null,
      packUnit: null, unitPriceCents: null, taxRatePct: null, lineTotalCents: null,
    }]);
    expect(page.droppedLines).toBe(0);
  });

  it("never invents a tax rate the model did not read", () => {
    const page = parseInvoicePage({ ...PAGE, lines: [{ description: "Olio", unitPrice: 9 }] });
    expect(page.lines[0]!.taxRatePct).toBeNull();
  });

  it("drops malformed lines, counts them and keeps the rest", () => {
    const page = parseInvoicePage({ ...PAGE, lines: [{ description: "" }, "garbage", PAGE.lines[1]] });
    expect(page.lines).toHaveLength(1);
    expect(page.lines[0]!.description).toBe("Limoni");
    expect(page.droppedLines).toBe(2);
  });

  it("nulls an invoice date that is not YYYY-MM-DD", () => {
    expect(parseInvoicePage({ ...PAGE, invoiceDate: "12/10/2026" }).invoiceDate).toBeNull();
  });

  it("reports a non-invoice page", () => {
    expect(parseInvoicePage({ isInvoice: false, lines: [] }).isInvoice).toBe(false);
  });

  it("throws invoice_response_invalid on a non-object", () => {
    expect(() => parseInvoicePage("nope")).toThrow(InvoiceExtractionError);
    expect(() => parseInvoicePage("nope")).toThrow("invoice_response_invalid");
  });
});

describe("extractInvoicePage", () => {
  it("sends the image, the schema and the incomplete code", async () => {
    await extractInvoicePage(new Uint8Array([1]), "image/png");
    const req = glm.generateGlmJson.mock.calls[0]![0] as { task: string; schema: { properties: Record<string, unknown> }; incompleteCode: string; content: unknown[] };
    expect(req.task).toBe("extraction");
    expect(Object.keys(req.schema.properties)).toContain("lines");
    expect(req.incompleteCode).toBe("invoice_extraction_incomplete");
    expect(req.content[0]).toMatchObject({ type: "image_url" });
  });

  it("retries once when the first answer is broken JSON", async () => {
    glm.generateGlmJson.mockRejectedValueOnce(new Error("ai_response_invalid"));
    const page = await extractInvoicePage(new Uint8Array([1]), "image/png");
    expect(glm.generateGlmJson).toHaveBeenCalledTimes(2);
    expect(page.lines).toHaveLength(2);
  });

  it("does not retry other errors", async () => {
    glm.generateGlmJson.mockRejectedValueOnce(new Error("ai_budget_exhausted"));
    await expect(extractInvoicePage(new Uint8Array([1]), "image/png")).rejects.toThrow("ai_budget_exhausted");
    expect(glm.generateGlmJson).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api exec vitest run lib/invoices/extraction.test.ts`
Expected: FAIL — `Failed to resolve import "./extraction"`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/lib/invoices/extraction.ts
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

async function generateInvoiceJson(request: Parameters<typeof generateGlmJson>[0]): Promise<unknown> {
  const started = Date.now();
  try {
    return await generateGlmJson(request);
  } catch (error) {
    const elapsedMs = Date.now() - started;
    if (!(error instanceof Error) || error.message !== "ai_response_invalid" || elapsedMs > RETRY_IF_FIRST_UNDER_MS) throw error;
    logger.info("invoice_extraction_retry", { reason: "ai_response_invalid", elapsedMs });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter api exec vitest run lib/invoices/extraction.test.ts`
Expected: PASS (all tests). Then `pnpm --filter api typecheck` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/invoices/extraction.ts apps/api/lib/invoices/extraction.test.ts
git commit -m "feat(invoices): read supplier invoice pages into structured lines"
```

---

### Task 2: Totals check and the feasibility spike script

**Files:**
- Create: `apps/api/lib/invoices/totals.ts`
- Test: `apps/api/lib/invoices/totals.test.ts`
- Create: `apps/api/scripts/invoice-spike.ts`

**Interfaces:**
- Consumes: `extractInvoicePage`, `ExtractedInvoicePage` (Task 1).
- Produces: `type TotalsCheck = { status: "ok" | "mismatch" | "unknown"; sumCents: number | null; diffCents: number | null }` and `checkTotals(lineTotalsCents: ReadonlyArray<number | null>, netTotalCents: number | null): TotalsCheck`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/lib/invoices/totals.test.ts
import { describe, expect, it } from "vitest";
import { checkTotals } from "./totals";

describe("checkTotals", () => {
  it("ok when lines add up to the net total", () => {
    expect(checkTotals([4000, 1250], 5250)).toEqual({ status: "ok", sumCents: 5250, diffCents: 0 });
  });

  it("tolerates rounding of one cent per line", () => {
    expect(checkTotals([3333, 3333, 3333], 10001).status).toBe("ok");
  });

  it("mismatch when a line is missing", () => {
    expect(checkTotals([4000], 5250)).toEqual({ status: "mismatch", sumCents: 4000, diffCents: -1250 });
  });

  it("counts discount and deposit lines with their sign", () => {
    expect(checkTotals([4000, 1250, -500], 4750).status).toBe("ok");
  });

  it("unknown when the net total was not read", () => {
    expect(checkTotals([4000], null)).toEqual({ status: "unknown", sumCents: 4000, diffCents: null });
  });

  it("unknown when any line total was not read", () => {
    expect(checkTotals([4000, null], 5250)).toEqual({ status: "unknown", sumCents: null, diffCents: null });
  });

  it("unknown when there are no lines", () => {
    expect(checkTotals([], 5250).status).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api exec vitest run lib/invoices/totals.test.ts`
Expected: FAIL — `Failed to resolve import "./totals"`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/lib/invoices/totals.ts
// Guards against the model skipping rows in dense tables: the read lines must
// add up to the invoice's net total, allowing one cent of rounding per line.
export type TotalsCheck = { status: "ok" | "mismatch" | "unknown"; sumCents: number | null; diffCents: number | null };

export function checkTotals(lineTotalsCents: ReadonlyArray<number | null>, netTotalCents: number | null): TotalsCheck {
  if (lineTotalsCents.length === 0 || lineTotalsCents.some((v) => v === null)) {
    return { status: "unknown", sumCents: null, diffCents: null };
  }
  const sumCents = (lineTotalsCents as number[]).reduce((a, b) => a + b, 0);
  if (netTotalCents === null) return { status: "unknown", sumCents, diffCents: null };
  const diffCents = sumCents - netTotalCents;
  const tolerance = Math.max(2, lineTotalsCents.length);
  return { status: Math.abs(diffCents) <= tolerance ? "ok" : "mismatch", sumCents, diffCents };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter api exec vitest run lib/invoices/totals.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the spike script**

```ts
// apps/api/scripts/invoice-spike.ts
// Feasibility gate for the invoice scanner (spec, delivery order step 0).
// Reads every invoice file in a folder with the production extraction and
// reports, per file, how many lines were read and whether they add up.
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/invoice-spike.ts <carpeta-con-facturas>
//
// Uses the dev database (generation budget) and the Z.ai key from .env.local.
// Writes <carpeta>/invoice-spike-report.json with the full readings.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

(() => {
  const envPath = join(__dirname, "..", ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
})();

import { extractInvoicePage } from "../lib/invoices/extraction";
import { checkTotals } from "../lib/invoices/totals";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: invoice-spike.ts <folder>");
  const files = readdirSync(dir).filter((f) => MIME[extname(f).toLowerCase()]);
  const report: unknown[] = [];
  for (const file of files) {
    const started = Date.now();
    try {
      const page = await extractInvoicePage(readFileSync(join(dir, file)), MIME[extname(file).toLowerCase()]!);
      const totals = checkTotals(page.lines.map((l) => l.lineTotalCents), page.netTotalCents);
      const withTax = page.lines.filter((l) => l.taxRatePct !== null).length;
      console.log(
        `${file}: ${page.supplierName ?? "?"} #${page.invoiceNumber ?? "?"} ${page.invoiceDate ?? "?"} | ` +
          `lines=${page.lines.length} dropped=${page.droppedLines} withTax=${withTax} | ` +
          `totals=${totals.status} diff=${totals.diffCents ?? "-"} | ${Date.now() - started}ms`,
      );
      report.push({ file, ms: Date.now() - started, totals, page });
    } catch (error) {
      console.log(`${file}: FAILED ${error instanceof Error ? error.message : String(error)}`);
      report.push({ file, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
    }
  }
  writeFileSync(join(dir, "invoice-spike-report.json"), JSON.stringify(report, null, 2));
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter api typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/lib/invoices/totals.ts apps/api/lib/invoices/totals.test.ts apps/api/scripts/invoice-spike.ts
git commit -m "feat(invoices): totals check and feasibility spike script"
```

- [ ] **Step 8: Run the gate (needs the user's invoices — blocking for Plan 2, not for Tasks 3-7)**

The user supplies 5-8 real invoices (paper photo, digital PDF, scanned PDF; different suppliers) in a folder outside the repo. Run:
`cd apps/api && ../../packages/db/node_modules/.bin/tsx scripts/invoice-spike.ts <folder>`
For each file, compare `lines=` with the real number of rows on the paper. Record per file: rows on paper, rows read, totals status, ms. Gate passes if every file reads all rows (or the totals check flags the ones that do not). If it fails, retry with a stronger model via `AI_EXTRACTION_MODEL=<model>` before giving up. Write the results into the spec under a new "Gate results" section and commit them. Do not commit the invoices or the report JSON.

---

### Task 3: Port product attributes to shared

**Files:**
- Create: `packages/shared/src/atributos.ts` (from `0e853af`)
- Create: `packages/shared/src/atributos.test.ts` (from `0e853af`)
- Modify: `packages/shared/src/index.ts` (add one export)

**Interfaces:**
- Consumes: `normalizeForMatch` (`packages/shared/src/normalize.ts:12`, unchanged on main).
- Produces (re-exported from `@atelier/shared`): `type Conservacion`, `type ProductAttributes = { baseName; baseKey; origen; calibreLabel; conservacion; packG }`, `toBaseKey(baseName: string): string`, `splitAttributes(desc: string): ProductAttributes`, `baseNameMatches(a: string, b: string): boolean`, `attributesMatch(a, b): boolean`, `hasDiscriminators(a): boolean`.

- [ ] **Step 1: Bring the test file first**

```bash
git show 0e853af:packages/shared/src/atributos.test.ts > packages/shared/src/atributos.test.ts
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @atelier/shared exec vitest run src/atributos.test.ts`
Expected: FAIL — cannot resolve `./atributos`.

- [ ] **Step 3: Bring the implementation and export it**

```bash
git show 0e853af:packages/shared/src/atributos.ts > packages/shared/src/atributos.ts
```

In `packages/shared/src/index.ts`, add as the last line (after `export * from "./ai-models";`):

```ts
export * from "./atributos";
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @atelier/shared exec vitest run src/atributos.test.ts` → PASS.
Run: `pnpm --filter @atelier/shared test && pnpm --filter @atelier/shared typecheck` → PASS (no export name clashes).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/atributos.ts packages/shared/src/atributos.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): product attributes (origin, calibre, storage) ported from escaner branch"
```

---

### Task 4: `ambiguo` match level in the API and the contract

**Files:**
- Modify: `apps/api/lib/products/matching.ts` (re-apply `0e853af` hunks)
- Modify: `apps/api/lib/products/__tests__/matching.test.ts` (re-apply `0e853af` hunks)
- Modify: `packages/shared/src/api-contract.ts:969-974` (`MatchResultSchema`)
- Modify: `apps/api/app/api/products/match/route.ts`, `apps/api/lib/products/migrate.ts`, `apps/api/scripts/migration-dryrun-report.ts`, `apps/mobile/src/api/products.ts`, `apps/mobile/app/productos/ajustes.tsx` (re-apply `0e853af` hunks)
- Modify: `packages/i18n/src/es.ts`, `en.ts`, `it.ts` (`migrate_dryrun_matches`)

**Interfaces:**
- Consumes: Task 3 exports.
- Produces:
  - `MatchLevel = "exact" | "ambiguo" | "probable" | "none"`
  - `MatchCandidate` gains `precioCompra?: number; unidadCompra?: string`
  - `AmbiguousCandidate = { id: string; name: string; origen: string | null; calibreLabel: string | null; precioCompra: number | null; unidadCompra: string | null }`
  - `MatchResult` gains `candidates: AmbiguousCandidate[]` (empty unless `level === "ambiguo"`)
  - Shared: `AmbiguousCandidateSchema`, `type AmbiguousCandidate`, `MatchResultSchema` with the new level and `candidates`.
  - `standardizeExtractedRecipe` keeps linking only `exact`; an `ambiguo` ingredient stays unlinked with no pending match (no change needed there; covered by a test).

- [ ] **Step 1: Re-apply the test hunks first**

```bash
git diff 8af2105 0e853af -- apps/api/lib/products/__tests__/matching.test.ts | git apply -3
```

If a hunk conflicts, keep main's existing tests and add the branch's new `describe`/`it` blocks.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api exec vitest run lib/products/__tests__/matching.test.ts`
Expected: FAIL — new tests expect `level: "ambiguo"` and `candidates`.

- [ ] **Step 3: Re-apply the source hunks**

```bash
git diff 8af2105 0e853af -- apps/api/lib/products/matching.ts | git apply -3
```

Main changed only the header comment and `stripPluralEs` (`7586fda`). On conflict, keep main's version of those two and take the branch's version of everything else:
- the `@atelier/shared` attributes import;
- the new `MatchLevel`, `MatchCandidate` fields, `AmbiguousCandidate` and `MatchResult.candidates`;
- `attrCache`/`attrsOf`/`toAmbiguous`/`positiveMatches`/`resolveFamily`;
- `levelRank = { exact: 3, ambiguo: 2, probable: 1, none: 0 }`;
- `candidates: []` on every return;
- the `resolveFamily` block before the final return.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter api exec vitest run lib/products/__tests__/matching.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the shared contract**

In `packages/shared/src/api-contract.ts`, replace `MatchResultSchema` (`:969-974`) with:

```ts
export const AmbiguousCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  origen: z.string().nullable(),
  calibreLabel: z.string().nullable(),
  precioCompra: z.number().nullable(),
  unidadCompra: z.string().nullable(),
});

export const MatchResultSchema = z.object({
  level: z.enum(["exact", "ambiguo", "probable", "none"]),
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  distance: z.number(),
  // Empty unless level is "ambiguo": the sibling products the chef picks from.
  candidates: z.array(AmbiguousCandidateSchema).default([]),
});
```

Next to `export type MatchResult` (`:1022`), add:

```ts
export type AmbiguousCandidate = z.infer<typeof AmbiguousCandidateSchema>;
```

- [ ] **Step 6: Re-apply the caller hunks**

```bash
git diff 8af2105 0e853af -- apps/api/app/api/products/match/route.ts apps/api/lib/products/migrate.ts apps/api/scripts/migration-dryrun-report.ts apps/mobile/src/api/products.ts apps/mobile/app/productos/ajustes.tsx | git apply -3
```

On conflict, keep main's code and add only the branch's lines:
- the match route's candidate select gains `precioCompra: true, unidadCompra: true`;
- the migrate report counts `ambiguo`;
- `MigrateRecipesReport.matches` gains `ambiguo: number`;
- the `ajustes.tsx` params gain `ambiguo: s.matches.ambiguo`.

Then edit `migrate_dryrun_matches` in `packages/i18n/src/es.ts`, `en.ts` and `it.ts` the same way the branch did:

```bash
git diff 8af2105 0e853af -- packages/i18n/src/es.ts packages/i18n/src/en.ts packages/i18n/src/it.ts
```

Copy each one-line change by hand (the files moved 21-22 commits since).

- [ ] **Step 7: Pin the pipeline behaviour with a test**

That file mocks `findMatch` and builds recipes with its `recipe(lines)` helper. Append inside `describe("standardizeExtractedRecipe", ...)`:

```ts
  it("an ambiguous ingredient stays unlinked and out of pendingMatches", () => {
    vi.mocked(findMatch).mockReturnValueOnce({
      level: "ambiguo",
      productId: null,
      productName: null,
      distance: 0,
      candidates: [
        { id: "g1", name: "gambero rosso mazara cal.3", origen: "mazara", calibreLabel: "cal.3", precioCompra: null, unidadCompra: null },
        { id: "g2", name: "gambero rosso sicilia 15/20", origen: "sicilia", calibreLabel: "15/20", precioCompra: null, unidadCompra: null },
      ],
    });
    const { response } = standardizeExtractedRecipe(recipe(["200 g gambero rosso"]), BANK);
    expect(response.recipeIngredients[0]!.productId).toBeNull();
    expect(response.pendingMatches).toEqual([]);
  });
```

Run: `pnpm --filter api exec vitest run lib/recipes/extraction-pipeline.test.ts` → PASS.

- [ ] **Step 8: Full checks**

Run: `pnpm typecheck && pnpm --filter api test && pnpm --filter @atelier/shared test && pnpm --filter @atelier/i18n test`
Expected: all PASS. `@atelier/i18n` checks that the three languages have the same keys.

- [ ] **Step 9: Commit**

```bash
git add apps/api packages/shared packages/i18n apps/mobile/src/api/products.ts apps/mobile/app/productos/ajustes.tsx
git commit -m "feat(banco): ambiguo match level between sibling products"
```

---

### Task 5: Mobile variant picker when saving a recipe

**Files:**
- Create: `apps/mobile/src/lib/match-queue.ts`
- Test: `apps/mobile/src/lib/__tests__/match-queue.test.ts`
- Create: `apps/mobile/src/components/PickVariantSheet.tsx`
- Test: `apps/mobile/src/components/__tests__/PickVariantSheet.test.ts`
- Modify: `apps/mobile/app/recetas/nueva.tsx` (save flow ~400-448, handlers 451-497, render 738-749)
- Modify: `packages/i18n/src/es.ts`, `en.ts`, `it.ts` (3 keys)

**Interfaces:**
- Consumes: `MatchResult` (with `candidates`) and `AmbiguousCandidate` from `@atelier/shared` (Task 4); `matchProducts` (`apps/mobile/src/api/products.ts:132`).
- Produces:
  - `type QueuedMatch = { kind: "confirm"; ingredientIdx: number; rawText: string; productId: string; productName: string } | { kind: "pick"; ingredientIdx: number; rawText: string; candidates: AmbiguousCandidate[] }`
  - `classifyMatches(results: MatchResult[], ingredientIdxs: number[], rawTexts: string[]): { linked: Array<{ ingredientIdx: number; productId: string }>; queue: QueuedMatch[]; drafts: number[] }`
  - `PickVariantSheet` props `{ open: boolean; rawText: string; candidates: AmbiguousCandidate[]; title: string; body: string; noneLabel: string; onPick: (productId: string) => void; onNone: () => void }`

- [ ] **Step 1: Write the failing test for the queue**

```ts
// apps/mobile/src/lib/__tests__/match-queue.test.ts
import { describe, expect, it } from "vitest";
import type { MatchResult } from "@atelier/shared";
import { classifyMatches } from "@/src/lib/match-queue";

const base = { productId: null, productName: null, distance: 0, candidates: [] };
const sibling = (id: string) => ({ id, name: id, origen: null, calibreLabel: null, precioCompra: null, unidadCompra: null });

describe("classifyMatches", () => {
  it("links exact, queues probable and ambiguous, drafts the rest", () => {
    const results: MatchResult[] = [
      { ...base, level: "exact", productId: "p1", productName: "Limón" },
      { ...base, level: "probable", productId: "p2", productName: "Ajo" },
      { ...base, level: "ambiguo", candidates: [sibling("g1"), sibling("g2")] },
      { ...base, level: "none" },
    ];
    const out = classifyMatches(results, [0, 3, 5, 6], ["limon", "ajos", "gambero rosso", "yuzu"]);
    expect(out.linked).toEqual([{ ingredientIdx: 0, productId: "p1" }]);
    expect(out.queue).toEqual([
      { kind: "confirm", ingredientIdx: 3, rawText: "ajos", productId: "p2", productName: "Ajo" },
      { kind: "pick", ingredientIdx: 5, rawText: "gambero rosso", candidates: [sibling("g1"), sibling("g2")] },
    ]);
    expect(out.drafts).toEqual([6]);
  });

  it("an ambiguous result with no candidates becomes a draft, never a crash", () => {
    const out = classifyMatches([{ ...base, level: "ambiguo" }], [2], ["x"]);
    expect(out.queue).toEqual([]);
    expect(out.drafts).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/match-queue.test.ts`
Expected: FAIL — cannot resolve `@/src/lib/match-queue`.

- [ ] **Step 3: Implement the queue**

```ts
// apps/mobile/src/lib/match-queue.ts
// Splits the bank-match results of a recipe's unlinked ingredients into what
// links silently, what the chef must confirm or pick, and what becomes a draft.
import type { AmbiguousCandidate, MatchResult } from "@atelier/shared";

export type QueuedMatch =
  | { kind: "confirm"; ingredientIdx: number; rawText: string; productId: string; productName: string }
  | { kind: "pick"; ingredientIdx: number; rawText: string; candidates: AmbiguousCandidate[] };

export function classifyMatches(
  results: MatchResult[],
  ingredientIdxs: number[],
  rawTexts: string[],
): { linked: Array<{ ingredientIdx: number; productId: string }>; queue: QueuedMatch[]; drafts: number[] } {
  const linked: Array<{ ingredientIdx: number; productId: string }> = [];
  const queue: QueuedMatch[] = [];
  const drafts: number[] = [];
  results.forEach((r, i) => {
    const ingredientIdx = ingredientIdxs[i]!;
    const rawText = rawTexts[i]!;
    if (r.level === "exact" && r.productId) {
      linked.push({ ingredientIdx, productId: r.productId });
    } else if (r.level === "probable" && r.productId && r.productName) {
      queue.push({ kind: "confirm", ingredientIdx, rawText, productId: r.productId, productName: r.productName });
    } else if (r.level === "ambiguo" && r.candidates.length > 0) {
      queue.push({ kind: "pick", ingredientIdx, rawText, candidates: r.candidates });
    } else {
      drafts.push(ingredientIdx);
    }
  });
  return { linked, queue, drafts };
}
```

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/match-queue.test.ts` → PASS.

- [ ] **Step 4: Write the failing sheet test**

```ts
// apps/mobile/src/components/__tests__/PickVariantSheet.test.ts
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  View: "View",
}));
const token = new Proxy({}, { get: () => 1 });
vi.mock("@/src/theme", () => ({
  colors: new Proxy({}, { get: () => "#000000" }),
  fonts: new Proxy({}, { get: () => "serif" }),
  fontSizes: token,
  radii: token,
  spacing: token,
}));

import { PickVariantSheet } from "@/src/components/PickVariantSheet";

const candidates = [
  { id: "g1", name: "Gambero rosso", origen: "Mazara", calibreLabel: "cal.3", precioCompra: 4500, unidadCompra: "kg" },
  { id: "g2", name: "Gambero rosso", origen: "Sicilia", calibreLabel: "15/20", precioCompra: null, unidadCompra: null },
];

function render(onPick = vi.fn(), onNone = vi.fn()) {
  let screen!: ReactTestRenderer;
  act(() => {
    screen = create(createElement(PickVariantSheet, {
      open: true, rawText: "gambero rosso", candidates,
      title: "pick_variant_title", body: "pick_variant_body", noneLabel: "pick_variant_none",
      onPick, onNone,
    }));
  });
  return screen;
}

describe("PickVariantSheet", () => {
  it("shows one option per sibling with its origin and calibre", () => {
    const screen = render();
    const options = screen.root.findAll((n) => n.props.testID?.startsWith?.("pick-variant-option-"));
    expect(options.map((o) => o.props.testID)).toEqual(["pick-variant-option-g1", "pick-variant-option-g2"]);
    const texts = screen.root.findAllByType("Text" as never).map((t) => [t.props.children].flat().join(""));
    expect(texts).toContain("Mazara · cal.3");
    expect(texts).toContain("Sicilia · 15/20");
  });

  it("picking an option returns its product id", () => {
    const onPick = vi.fn();
    const screen = render(onPick);
    act(() => screen.root.find((n) => n.props.testID === "pick-variant-option-g2").props.onPress());
    expect(onPick).toHaveBeenCalledWith("g2");
  });

  it("'none of these' calls onNone", () => {
    const onNone = vi.fn();
    const screen = render(vi.fn(), onNone);
    act(() => screen.root.find((n) => n.props.testID === "pick-variant-none").props.onPress());
    expect(onNone).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm --filter mobile exec vitest run src/components/__tests__/PickVariantSheet.test.ts`
Expected: FAIL — cannot resolve `@/src/components/PickVariantSheet`.

- [ ] **Step 6: Implement the sheet**

Same dialog pattern as `ConfirmMatchSheet.tsx` (centred `Modal`, strings from the parent).

```tsx
// apps/mobile/src/components/PickVariantSheet.tsx
// The ingredient matches several sibling products of one family (same base
// name, different origin or calibre). The chef picks one, or none to create
// a new product. No alias is saved: the generic text must stay ambiguous.
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AmbiguousCandidate } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  rawText: string;
  candidates: AmbiguousCandidate[];
  title: string;
  body: string;
  noneLabel: string;
  onPick: (productId: string) => void;
  onNone: () => void;
};

export function PickVariantSheet({ open, rawText, candidates, title, body, noneLabel, onPick, onNone }: Props) {
  return (
    <Modal visible={open} animationType="fade" transparent onRequestClose={onNone}>
      <Pressable style={styles.backdrop} onPress={onNone}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.raw}>«{rawText}»</Text>
          <Text style={styles.body}>{body}</Text>
          <ScrollView style={styles.list}>
            {candidates.map((c) => {
              const detail = [c.origen, c.calibreLabel].filter(Boolean).join(" · ");
              return (
                <Pressable key={c.id} testID={`pick-variant-option-${c.id}`} style={styles.option} onPress={() => onPick(c.id)}>
                  <Text style={styles.optionName}>{c.name}</Text>
                  {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable testID="pick-variant-none" style={styles.btnGhost} onPress={onNone}>
            <Text style={styles.btnGhostLabel}>{noneLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: 360, maxHeight: "80%", backgroundColor: colors.paper, borderRadius: radii.lg, padding: spacing.xl, gap: spacing.md },
  title: { fontFamily: fonts.serifItalic, fontSize: fontSizes.serifLg, color: colors.ink },
  raw: { fontFamily: fonts.serif, fontSize: fontSizes.body, color: colors.terracota },
  body: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  list: { flexGrow: 0 },
  option: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 0.5, borderColor: colors.edge, marginBottom: spacing.sm, backgroundColor: colors.paperSoft },
  optionName: { fontFamily: fonts.serif, fontSize: fontSizes.body, color: colors.ink },
  optionDetail: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  btnGhost: { alignSelf: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.pill, borderWidth: 0.5, borderColor: colors.edge },
  btnGhostLabel: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.ink },
});
```

Run: `pnpm --filter mobile exec vitest run src/components/__tests__/PickVariantSheet.test.ts` → PASS.

- [ ] **Step 7: Add i18n keys**

In `packages/i18n/src/es.ts`, after `confirm_match_no`:

```ts
  pick_variant_title: "¿Cuál de estos es?",
  pick_variant_body: "En el banco hay varios productos de esta familia. Elegí el que usa la receta.",
  pick_variant_none: "Ninguno, crear nuevo",
```

`en.ts` (after `confirm_match_no`):

```ts
  pick_variant_title: "Which one is it?",
  pick_variant_body: "The bank has several products in this family. Pick the one this recipe uses.",
  pick_variant_none: "None, create new",
```

`it.ts` (after `confirm_match_no`):

```ts
  pick_variant_title: "Quale di questi è?",
  pick_variant_body: "Nel banco ci sono più prodotti di questa famiglia. Scegli quello che usa la ricetta.",
  pick_variant_none: "Nessuno, crea nuovo",
```

- [ ] **Step 8: Wire it into the recipe save flow (`apps/mobile/app/recetas/nueva.tsx`)**

1. Imports: add `import { PickVariantSheet } from "@/src/components/PickVariantSheet";` and `import { classifyMatches, type QueuedMatch } from "@/src/lib/match-queue";`.
2. Replace the `PendingMatch` type (`:76-82`) and its state (`:110`) with:

```ts
const [pendingMatches, setPendingMatches] = useState<QueuedMatch[]>([]);
```

3. In the save flow (~`:400-448`), replace the loop over `matchProducts` results that does the exact/probable/else split with:

```ts
const { linked, queue, drafts } = classifyMatches(results, toMatchIdx, toMatchTexts);
for (const l of linked) working[l.ingredientIdx]!.productId = l.productId;
draftIndices.push(...drafts);
flowStateRef.current = { workingIngredients: working, draftIndices };
if (queue.length > 0) setPendingMatches(queue);
else await finalize();
```

Use the existing variable names in that block: `results` is the `matchProducts` return, `toMatchTexts` the texts, and the parallel index array is whatever that block already builds. Rename in the snippet if it differs.

4. `handleMatchYes` (`:451`): it reads `current.productId`/`current.productName`. Add a guard at the top: `if (!current || current.kind !== "confirm") return;`.
5. Add a pick handler next to `handleMatchNo` (`:484`):

```ts
async function handlePickVariant(productId: string) {
  const current = pendingMatches[0];
  const state = flowStateRef.current;
  if (!current || current.kind !== "pick" || !state) return;
  state.workingIngredients[current.ingredientIdx]!.productId = productId;
  const remaining = pendingMatches.slice(1);
  setPendingMatches(remaining);
  if (remaining.length === 0) await finalize();
}
```

`handleMatchNo` already works for both kinds (it only uses `ingredientIdx`). Reuse it for "none of these".

6. Render (`:738-749`): change the condition to `currentMatch?.kind === "confirm"` for `ConfirmMatchSheet`, and add:

```tsx
{currentMatch?.kind === "pick" ? (
  <PickVariantSheet
    open
    rawText={currentMatch.rawText}
    candidates={currentMatch.candidates}
    title={t("pick_variant_title")}
    body={t("pick_variant_body")}
    noneLabel={t("pick_variant_none")}
    onPick={(id) => void handlePickVariant(id)}
    onNone={() => void handleMatchNo()}
  />
) : null}
```

- [ ] **Step 9: Checks**

Run: `pnpm --filter mobile test && pnpm --filter mobile typecheck && pnpm --filter @atelier/i18n test`
Expected: all PASS. If `mobile` has no `typecheck` script, run `pnpm --filter mobile exec tsc --noEmit`.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile packages/i18n
git commit -m "feat(mobile): pick the right variant when an ingredient matches several siblings"
```

---

### Task 6: Invoice data model and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (Product `:669-733`, ProductPriceHistory `:798-811`, Restaurant `:134`, User, new models)
- Create: `packages/db/prisma/migrations/20261014220000_supplier_invoices/migration.sql`

**Interfaces:**
- Produces Prisma models `Supplier`, `Invoice`, `InvoicePage`, `InvoiceLine`, `SupplierItem`, enums `InvoiceStatus`, `InvoiceLineAction`, `Product.taxRatePct` (Decimal, default 0), `ProductPriceHistory.invoiceLineId`. Plan 2 uses these names as-is.

- [ ] **Step 1: Edit the schema**

In `model Product`, after `precioCompra Int // centavos / cents`, add:

```prisma
  // Purchase tax rate (IVA/VAT/GST) in percent. precioCompra stays net;
  // recipe cost adds this rate. 0 = unknown or exempt. CHECK 0..100.
  taxRatePct Decimal @default(0) @db.Decimal(5, 2)
```

and in its relation list add:

```prisma
  invoiceLines  InvoiceLine[]
  supplierItems SupplierItem[]
```

In `model ProductPriceHistory`, after `unidadCompra ProductUnit`, add:

```prisma
  // Set when the price came from a scanned invoice line.
  invoiceLineId String?
  invoiceLine   InvoiceLine? @relation(fields: [invoiceLineId], references: [id], onDelete: SetNull)
```

and `@@index([invoiceLineId])` next to the existing index.

In `model Restaurant`, in the unaligned block of newer back-relations (near `chefNotes ChefNote[]`), add:

```prisma
  suppliers Supplier[]
  invoices  Invoice[]
```

In `model User`, add `uploadedInvoices Invoice[] @relation("InvoiceUploader")`.

Append the new enums and models:

```prisma
enum InvoiceStatus {
  reading
  review
  applied
  failed
}

enum InvoiceLineAction {
  update_price
  create_draft
  connect
  ignore
}

// A supplier of one restaurant. nameNorm dedupes "Pescheria X" / "PESCHERIA X srl".
model Supplier {
  id           String     @id @default(cuid())
  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  name         String
  nameNorm     String
  taxId        String?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  invoices Invoice[]
  items    SupplierItem[]

  @@unique([restaurantId, nameNorm])
}

// One scanned supplier invoice or delivery note. supplierId is null while
// reading. Duplicates (same supplier + number) are warned about, not blocked.
model Invoice {
  id              String        @id @default(cuid())
  restaurantId    String
  restaurant      Restaurant    @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  supplierId      String?
  supplier        Supplier?     @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  number          String?
  issuedOn        DateTime?     @db.Date
  netTotalCents   Int?
  taxTotalCents   Int?
  grossTotalCents Int?
  status          InvoiceStatus @default(reading)
  failureReason   String?
  uploadedById    String?
  uploadedBy      User?         @relation("InvoiceUploader", fields: [uploadedById], references: [id], onDelete: SetNull)
  appliedAt       DateTime?
  deletedAt       DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  pages InvoicePage[]
  lines InvoiceLine[]

  @@index([restaurantId, deletedAt, issuedOn])
  @@index([restaurantId, status])
  @@index([supplierId, number])
}

// The original file of one page (photo) or one whole PDF, in upload order.
model InvoicePage {
  id         String  @id @default(cuid())
  invoiceId  String
  invoice    Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  position   Int
  storageKey String
  mimeType   String
  sizeBytes  Int

  @@unique([invoiceId, position])
}

// One row as read from the paper, plus what the chef decided for it.
model InvoiceLine {
  id                String             @id @default(cuid())
  invoiceId         String
  invoice           Invoice            @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  position          Int
  description       String
  code              String?
  quantity          Decimal?           @db.Decimal(12, 3)
  unit              String?
  packQty           Decimal?           @db.Decimal(12, 3)
  packUnit          String?
  unitPriceCents    Int?
  taxRatePct        Decimal?           @db.Decimal(5, 2)
  lineTotalCents    Int?
  productId         String?
  product           Product?           @relation(fields: [productId], references: [id], onDelete: SetNull)
  matchLevel        String?
  action            InvoiceLineAction?
  appliedPriceCents Int?

  priceHistory ProductPriceHistory[]

  @@unique([invoiceId, position])
  @@index([productId])
}

// Supplier memory: once the chef confirms "this description (or code) from
// this supplier is that product", the next invoice matches deterministically.
model SupplierItem {
  id              String   @id @default(cuid())
  supplierId      String
  supplier        Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  code            String?
  descriptionNorm String
  productId       String
  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  packQty         Decimal? @db.Decimal(12, 3)
  packUnit        String?
  lastPriceCents  Int?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([supplierId, descriptionNorm])
  @@unique([supplierId, code])
  @@index([productId])
}
```

- [ ] **Step 2: Validate the schema**

Run (from `packages/db`): `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 3: Generate the migration SQL (procedure from `docs/OPERACIONES.md:365-394`)**

From `packages/db` in PowerShell:

```powershell
git show HEAD:packages/db/prisma/schema.prisma > $env:TEMP\base.prisma
npx prisma migrate diff --from-schema-datamodel $env:TEMP\base.prisma --to-schema-datamodel prisma\schema.prisma --script > prisma\migrations\20261014220000_supplier_invoices\migration.sql
```

Create the folder first if needed. Save it as UTF-8 without BOM. Then append the CHECK constraints by hand at the end of `migration.sql`:

```sql
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_taxRatePct_range" CHECK ("taxRatePct" >= 0 AND "taxRatePct" <= 100);

ALTER TABLE "InvoiceLine"
  ADD CONSTRAINT "InvoiceLine_taxRatePct_range" CHECK ("taxRatePct" IS NULL OR ("taxRatePct" >= 0 AND "taxRatePct" <= 100));
```

Expected: the generated part creates two enums and five tables, adds `Product.taxRatePct` with `DEFAULT 0` and `ProductPriceHistory.invoiceLineId`, plus their indexes and foreign keys. It contains no `DROP` statements.

- [ ] **Step 4: Apply to dev and regenerate the client**

From `packages/db`, with `DATABASE_URL` pointing at the dev branch (`ep-summer-heart`, as in OPERACIONES.md):

```powershell
npx prisma migrate deploy
pnpm db:generate
```

Expected: `1 migration applied`. Then re-run the Step 3 diff with `--from-migrations prisma\migrations --to-schema-datamodel prisma\schema.prisma --shadow-database-url <dev shadow url>`, or simply check that `npx prisma migrate status` reports `Database schema is up to date`.

- [ ] **Step 5: Typecheck everything**

Run (repo root): `pnpm typecheck && pnpm --filter api test`
Expected: PASS. The new `Product.taxRatePct` is not selected anywhere yet, so no test output changes.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20261014220000_supplier_invoices
git commit -m "feat(db): suppliers, invoices, invoice lines, supplier memory and product tax rate"
```

---

### Task 7: Tax in recipe cost

**Files:**
- Modify: `apps/api/lib/products/cost.ts` (`RecipeIngredientForCost.product` `:98-107`, the loop `:304`)
- Modify: `apps/api/lib/projections.ts` (select `:44-62`, row type `:186-208`, mapper `:229-245`)
- Modify: `apps/api/lib/products/recalc.ts:90-93` and its mapper (~`:110`)
- Test: `apps/api/lib/products/cost.test.ts`

**Interfaces:**
- Consumes: `Product.taxRatePct` (Task 6).
- Produces: `RecipeIngredientForCost.product.taxRatePct?: number` (percent; absent or 0 means no tax). Plan 2's product projections reuse this field name.

- [ ] **Step 1: Write the failing tests** (append to `apps/api/lib/products/cost.test.ts`, which already has the `ing()` helper)

```ts
describe("purchase tax in recipe cost", () => {
  it("adds the product tax rate to the cost", () => {
    const r = computeRecipeCost({ ingredients: [ing({ productOverrides: { taxRatePct: 10 } })], portions: null, salePriceCents: null });
    expect(r.totalCents).toBeCloseTo(1100);
  });

  it("no rate means no change (existing products)", () => {
    const r = computeRecipeCost({ ingredients: [ing({})], portions: null, salePriceCents: null });
    expect(r.totalCents).toBeCloseTo(1000);
  });

  it("applies tax before waste", () => {
    const r = computeRecipeCost({ ingredients: [ing({ productOverrides: { taxRatePct: 10, mermaPct: 50 } })], portions: null, salePriceCents: null });
    expect(r.totalCents).toBeCloseTo(2200);
  });

  it("taxes products bought by the piece", () => {
    const r = computeRecipeCost({
      ingredients: [ing({ qty: 2, unit: "unidad", productOverrides: { unidadCompra: "unidad", taxRatePct: 22 } })],
      portions: null,
      salePriceCents: null,
    });
    expect(r.totalCents).toBeCloseTo(2440);
  });
});
```


- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api exec vitest run lib/products/cost.test.ts`
Expected: FAIL on `taxRatePct` (a type error and/or 1000 instead of 1100).

- [ ] **Step 3: Implement**

In `RecipeIngredientForCost.product` (`cost.ts:98`), after `precioCompra: number; // centavos`, add:

```ts
    // Purchase tax in percent (Product.taxRatePct). Absent or 0 = no tax.
    taxRatePct?: number;
```

Above `function priceIngredient` (`:214`), add:

```ts
// precioCompra is net; recipe cost shows it with the product's purchase tax
// (spec 2026-10-14). Applied to the price itself so every unit path and the
// waste correction see the taxed price.
function withTax(product: LinkedProduct): LinkedProduct {
  const rate = product.taxRatePct ?? 0;
  if (!(rate > 0)) return product;
  return { ...product, precioCompra: product.precioCompra * (1 + rate / 100) };
}
```

At `:304`, change:

```ts
      const pricing = priceIngredient(ing, product, ing.qty, ing.unit);
```

to:

```ts
      const pricing = priceIngredient(ing, withTax(product), ing.qty, ing.unit);
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter api exec vitest run lib/products/cost.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Feed the rate from the database**

`apps/api/lib/projections.ts`:
- In the product select (`:44-62`), add `taxRatePct: true,` next to `mermaPct: true,`.
- In `RecipeIngredientRow.product` (`:193-195`), add `taxRatePct: { toString(): string }; // Prisma.Decimal`.
- In `mapIngredientsForCost` (`:231-232`), add `taxRatePct: Number(row.product.taxRatePct.toString()),` after `mermaPct`.

`apps/api/lib/products/recalc.ts`:
- In the select (`:90-93`), add `taxRatePct: true,` after `mermaPct: true,`.
- In the mapper, after `mermaPct: Number(ri.product.mermaPct),`, add `taxRatePct: Number(ri.product.taxRatePct),`. The spread `...ri.product` would otherwise pass a Decimal.

- [ ] **Step 6: Full checks**

Run: `pnpm typecheck && pnpm --filter api test`
Expected: PASS. Any projection test fixture that builds a product row literal must gain `taxRatePct` — add `taxRatePct: { toString: () => "0" }` in those fixtures so outputs stay identical.

- [ ] **Step 7: Commit**

```bash
git add apps/api/lib/products/cost.ts apps/api/lib/products/cost.test.ts apps/api/lib/projections.ts apps/api/lib/products/recalc.ts
git commit -m "feat(costos): recipe cost includes the product purchase tax"
```

---

### Task 8: Invoice pricing rules

**Files:**
- Create: `apps/api/lib/invoices/pricing.ts`
- Test: `apps/api/lib/invoices/pricing.test.ts`

**Interfaces:**
- Consumes: `convertUnit(qty, from, to)` (`apps/api/lib/products/cost.ts:66`), `ProductUnit` (`@atelier/db`).
- Produces:
  - `BIG_CHANGE_PCT = 20`
  - `normalizeInvoiceUnit(raw: string | null): ProductUnit | null`
  - `priceInBankUnit(input: { unitPriceCents: number | null; unit: string | null; packQty: number | null; packUnit: string | null }, bankUnit: ProductUnit): number | null`
  - `type LineProposal = { action: "create_draft"; priceCents: number | null; preselected: true } | { action: "update_price"; priceCents: number; changePct: number | null; preselected: boolean } | { action: "connect"; priceCents: null; reason: "unsafe_conversion" | "older_invoice" | "same_price" }`
  - `proposeLine(input: { productId: string | null; currentPriceCents: number; currentPriceAt: Date | null; newPriceCents: number | null; invoiceDate: string /* YYYY-MM-DD */ }): LineProposal`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/lib/invoices/pricing.test.ts
import { describe, expect, it } from "vitest";
import { normalizeInvoiceUnit, priceInBankUnit, proposeLine } from "./pricing";

describe("normalizeInvoiceUnit", () => {
  it.each([
    ["kg", "kg"], ["KG", "kg"], ["kilo", "kg"], ["gr", "g"], ["lt", "l"], ["ml", "ml"],
    ["pz", "unidad"], ["pezzi", "unidad"], ["unid.", "unidad"], ["pcs", "unidad"],
    ["cassa", "caja"], ["cartone", "caja"], ["box", "caja"], ["ct", "caja"],
    ["mazzo", null], [null, null], ["", null],
  ])("%j -> %j", (raw, expected) => {
    expect(normalizeInvoiceUnit(raw)).toBe(expected);
  });
});

describe("priceInBankUnit", () => {
  const p = (unitPriceCents: number | null, unit: string | null, packQty: number | null = null, packUnit: string | null = null) =>
    ({ unitPriceCents, unit, packQty, packUnit });

  it("same unit passes through", () => expect(priceInBankUnit(p(1250, "kg"), "kg")).toBe(1250));
  it("grams to kilos", () => expect(priceInBankUnit(p(2, "g"), "kg")).toBe(2000));
  it("kilos to grams rounds to the cent", () => expect(priceInBankUnit(p(1250, "kg"), "g")).toBe(1));
  it("a case with known content becomes a price per kilo", () => expect(priceInBankUnit(p(4000, "cassa", 5, "kg"), "kg")).toBe(800));
  it("a case with content in grams, bank in kilos", () => expect(priceInBankUnit(p(1200, "cassa", 500, "g"), "kg")).toBe(2400));
  it("a case without content, bank in kilos: unsafe", () => expect(priceInBankUnit(p(4000, "cassa"), "kg")).toBeNull());
  it("a case bought by the case stays per case", () => expect(priceInBankUnit(p(4000, "cassa"), "caja")).toBe(4000));
  it("weight to volume without density: unsafe", () => expect(priceInBankUnit(p(900, "kg"), "l")).toBeNull());
  it("unknown unit: unsafe", () => expect(priceInBankUnit(p(300, "mazzo"), "unidad")).toBeNull());
  it("no price (delivery note): null", () => expect(priceInBankUnit(p(null, "kg"), "kg")).toBeNull());
  it("negative or zero price (discount, deposit): null", () => {
    expect(priceInBankUnit(p(-500, "kg"), "kg")).toBeNull();
    expect(priceInBankUnit(p(0, "kg"), "kg")).toBeNull();
  });
});

describe("proposeLine", () => {
  const base = { productId: "p1", currentPriceCents: 1000, currentPriceAt: new Date("2026-10-01T09:00:00Z"), invoiceDate: "2026-10-12" };

  it("no product: create a draft, with the price if known", () => {
    expect(proposeLine({ ...base, productId: null, newPriceCents: 800 })).toEqual({ action: "create_draft", priceCents: 800, preselected: true });
    expect(proposeLine({ ...base, productId: null, newPriceCents: null })).toEqual({ action: "create_draft", priceCents: null, preselected: true });
  });

  it("unsafe conversion: connect without price", () => {
    expect(proposeLine({ ...base, newPriceCents: null })).toEqual({ action: "connect", priceCents: null, reason: "unsafe_conversion" });
  });

  it("small change is pre-selected", () => {
    expect(proposeLine({ ...base, newPriceCents: 1190 })).toEqual({ action: "update_price", priceCents: 1190, changePct: 19, preselected: true });
  });

  it("20% or more needs an explicit tick, both directions", () => {
    expect(proposeLine({ ...base, newPriceCents: 1200 })).toMatchObject({ action: "update_price", changePct: 20, preselected: false });
    expect(proposeLine({ ...base, newPriceCents: 700 })).toMatchObject({ action: "update_price", changePct: -30, preselected: false });
  });

  it("product without a price yet: update, pre-selected, no change %", () => {
    expect(proposeLine({ ...base, currentPriceCents: 0, newPriceCents: 800 })).toEqual({ action: "update_price", priceCents: 800, changePct: null, preselected: true });
  });

  it("same price: connect only", () => {
    expect(proposeLine({ ...base, newPriceCents: 1000 })).toEqual({ action: "connect", priceCents: null, reason: "same_price" });
  });

  it("an older invoice never overwrites the current price", () => {
    expect(proposeLine({ ...base, invoiceDate: "2026-09-30", newPriceCents: 1100 })).toEqual({ action: "connect", priceCents: null, reason: "older_invoice" });
  });

  it("an invoice from the same day as the current price still updates", () => {
    expect(proposeLine({ ...base, invoiceDate: "2026-10-01", newPriceCents: 1100 })).toMatchObject({ action: "update_price", priceCents: 1100 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api exec vitest run lib/invoices/pricing.test.ts`
Expected: FAIL — `Failed to resolve import "./pricing"`.

- [ ] **Step 3: Implement**

```ts
// apps/api/lib/invoices/pricing.ts
// Turns one invoice line into a price in the product's bank unit and decides
// what the review screen proposes. Pure rules from the 2026-10-14 spec: last
// price paid wins, under 20% is pre-selected, an unsafe conversion proposes
// no price, and an invoice older than the current price never overwrites it.
import type { ProductUnit } from "@atelier/db";
import { convertUnit } from "../products/cost";

export const BIG_CHANGE_PCT = 20;

const UNIT_ALIASES: Record<string, ProductUnit> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", chilo: "kg", chili: "kg",
  g: "g", gr: "g", grs: "g", grammi: "g", gramos: "g", grams: "g",
  l: "l", lt: "l", lts: "l", litro: "l", litri: "l", litros: "l", litre: "l", liter: "l",
  ml: "ml",
  pz: "unidad", pezzi: "unidad", pezzo: "unidad", un: "unidad", unid: "unidad", unidad: "unidad",
  unidades: "unidad", u: "unidad", n: "unidad", nr: "unidad", pc: "unidad", pcs: "unidad", unit: "unidad", units: "unidad",
  cassa: "caja", casse: "caja", caja: "caja", cajas: "caja", box: "caja", cartone: "caja", cartoni: "caja",
  ct: "caja", cs: "caja", collo: "caja", colli: "caja", case: "caja",
};

export function normalizeInvoiceUnit(raw: string | null): ProductUnit | null {
  if (!raw) return null;
  return UNIT_ALIASES[raw.trim().toLowerCase().replace(/\.$/, "")] ?? null;
}

export function priceInBankUnit(
  input: { unitPriceCents: number | null; unit: string | null; packQty: number | null; packUnit: string | null },
  bankUnit: ProductUnit,
): number | null {
  if (input.unitPriceCents === null || !(input.unitPriceCents > 0)) return null;
  const unit = normalizeInvoiceUnit(input.unit);
  if (unit === null) return null;
  if (unit === bankUnit) return input.unitPriceCents;

  let priceCents = input.unitPriceCents;
  let perUnit: ProductUnit = unit;
  const packUnit = normalizeInvoiceUnit(input.packUnit);
  if ((unit === "caja" || unit === "unidad") && input.packQty !== null && input.packQty > 0 && packUnit !== null) {
    priceCents = input.unitPriceCents / input.packQty;
    perUnit = packUnit;
  }
  // How many `perUnit` fit in one bank unit (1 kg = 1000 g). Null when the
  // conversion needs a density or a pack content we do not have.
  const perUnitsInBankUnit = convertUnit(1, bankUnit, perUnit);
  if (perUnitsInBankUnit === null) return null;
  return Math.round(priceCents * perUnitsInBankUnit);
}

export type LineProposal =
  | { action: "create_draft"; priceCents: number | null; preselected: true }
  | { action: "update_price"; priceCents: number; changePct: number | null; preselected: boolean }
  | { action: "connect"; priceCents: null; reason: "unsafe_conversion" | "older_invoice" | "same_price" };

export function proposeLine(input: {
  productId: string | null;
  currentPriceCents: number;
  currentPriceAt: Date | null;
  newPriceCents: number | null;
  invoiceDate: string;
}): LineProposal {
  if (input.productId === null) return { action: "create_draft", priceCents: input.newPriceCents, preselected: true };
  if (input.newPriceCents === null) return { action: "connect", priceCents: null, reason: "unsafe_conversion" };
  // Compare calendar days: the invoice has a date, the price a timestamp.
  if (input.currentPriceAt && input.invoiceDate < input.currentPriceAt.toISOString().slice(0, 10)) {
    return { action: "connect", priceCents: null, reason: "older_invoice" };
  }
  if (input.currentPriceCents <= 0) {
    return { action: "update_price", priceCents: input.newPriceCents, changePct: null, preselected: true };
  }
  if (input.newPriceCents === input.currentPriceCents) return { action: "connect", priceCents: null, reason: "same_price" };
  const changePct = Math.round(((input.newPriceCents - input.currentPriceCents) / input.currentPriceCents) * 100);
  return { action: "update_price", priceCents: input.newPriceCents, changePct, preselected: Math.abs(changePct) < BIG_CHANGE_PCT };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter api exec vitest run lib/invoices/pricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Full checks**

Run: `pnpm typecheck && pnpm --filter api test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/lib/invoices/pricing.ts apps/api/lib/invoices/pricing.test.ts
git commit -m "feat(invoices): price conversion to the bank unit and line proposal rules"
```

---

## After Plan 1

- Push the branch.
- Report the gate results (Task 2 Step 8) to the user.
- Write Plan 2 from the spec plus the gate results: upload/read/apply routes, background execution, private storage, supplier memory, the AI second look, invoice screens, the product-form tax field, price history linking, and invoice trash purge.
