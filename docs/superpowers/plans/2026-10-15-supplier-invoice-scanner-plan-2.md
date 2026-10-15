# Supplier Invoice Scanner — Plan 2 (API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the invoice scanner needs on the server. Plan 2 covers four groups:
- Reading fixes for the 7 problems found with real invoices (G1–G7).
- Private file storage for invoice photos and PDFs.
- The background read: AI reading, supplier memory, a second AI look at doubtful lines, and price proposals.
- The routes to upload, list, review, edit, apply, retry and delete invoices, plus purging deleted invoices and their files.

**Architecture:**
- Pure rules stay in `apps/api/lib/invoices/`:
  - `extraction.ts`, `totals.ts` and `pricing.ts`, from Plan 1.
  - New: `line-matching.ts`, `second-look.ts` and `storage.ts`.
- `propose.ts` turns read lines into proposals.
- `read-invoice.ts` runs the background read; `apply.ts` applies a reviewed invoice in one transaction.
- Routes under `apps/api/app/api/invoices/` are thin:
  - Upload routes use multipart and `requireAuth`, the same as the recipe upload.
  - JSON routes use `withAuth`.
  - Reading runs in `after()` with `maxDuration = 300`, the same as `apps/api/app/api/recipes/route.ts`.
- Mobile screens are **Plan 3**.

**Tech Stack:**
- TypeScript, Next.js 15 App Router (`after()`), Prisma/PostgreSQL, Zod 3, vitest.
- `@vercel/blob` with `access: "private"`.
- Z.ai GLM via `generateGlmJson`.

**Spec:** `docs/superpowers/specs/2026-10-14-supplier-invoice-scanner-design.md`

**Inputs carried in:**
- The real-invoice gate findings G1–G7, in `odd/tasks/supplier-invoice-scanner.md`, log L7.
- Plan 1's deferred minors #5, #6, #7, #9 and #13.
- The migration verifier advisories: tenant scoping, same-restaurant links, purging files, empty code → null, P2002 on `SupplierItem`, and supplier upsert.

## Global Constraints

- Price rule: a change under 20% is pre-selected; 20% or more needs an explicit tick (`BIG_CHANGE_PCT = 20`). Compare the **unrounded** percentage (minor #6).
- An unsafe unit conversion proposes no price (`null`), never a guess. A box price never becomes a unit price (G3).
- An invoice older than the product's current price date never overwrites the price. When an invoice sets a price, `precioActualizadoAt` is the invoice date at 12:00 UTC (minor #5).
- `precioCompra` stays net, in cents. A tax rate the model did not read stays `null` and never overwrites a product's rate.
- Roles: every invoice route needs `manage_products` (admin, chef_executive, sous_chef). No new permission.
- Tenant scoping: every query on Invoice, InvoiceLine, Supplier and SupplierItem is filtered by `restaurantId`, directly or through the invoice. A product linked to a line must belong to the same restaurant and must not be deleted.
- Invoice files are private:
  - Stored with `access: "private"`.
  - Served only through an authenticated route.
  - A blob URL or pathname is never sent to clients.
- Each page read counts against the uploader's daily AI quota (`reserveAiCall`) and the generation budget (`generateGlmJson`).
- AI prompts stay in Spanish, like the existing extraction prompts. Code, comments, identifiers and error codes are in English.
- Mobile is out of scope: no files under `apps/mobile` change in this plan.
- Commits use Conventional Commits, with no AI attribution lines (user rule).
- Migrations are applied to the **dev** database only, after an independent verifier passes. Production is never touched.

## Review Focus

1. **A delivery note whose lines carry only a description** (no price, unit or quantity), such as "Vongole veraci". The line is kept and proposed as a draft with no price; it is never merged into another line or dropped. Pinned in Task 2.
2. **Two people press "Apply" at the same time, or one presses twice.** Prices, history and drafts are written exactly once, and the second call returns `alreadyApplied`. Pinned in Task 14.
3. **A page file missing from storage, or a storage outage during upload.** The invoice fails with `file_missing`, or the upload returns 503 with no orphan invoice row, and nothing crashes. Pinned in Tasks 9 and 11.
4. **A line linked to a product of another restaurant, or to a deleted product.** The PATCH is refused; at apply time a product deleted meanwhile is skipped and reported, never resurrected. Pinned in Tasks 13 and 14.
5. **An invoice still `reading` after the background run died** (timeout, deploy). After 10 minutes it shows as `failed` with `read_timeout`, and Retry works. Pinned in Task 12.

## Rulings made while writing this plan

- **Split.** Plan 2 is the API only; the mobile screens (Facturas in Casa, scan, review, apply, product-form tax field, history link) are Plan 3. Each plan ships working, testable software on its own.
- **New `uploading` status.**
  - Expo's `FileSystem.uploadAsync` sends one file per request, and the codebase avoids `fetch` with `FormData` in standalone builds. Several camera pages therefore arrive as several requests.
  - The invoice is created in `uploading` with page 1, more pages are added, and `/read` starts the background read.
  - Invoices abandoned in `uploading` are purged after 24 hours, files included.
  - Cost if wrong: one enum value; additive migration.
- **Apply tests.** The spec asks for apply on real PostgreSQL, but the API has no integration suite (only `vitest run` with a mocked Prisma). Apply is tested with a mocked transaction, like every other route, and Task 17 runs it once against the dev database. Cost if wrong: a SQL-level issue Prisma mocks cannot see would show up only in the dev run.
- **Supplier memory is written after the apply transaction, best effort.** A P2002 from a concurrent apply must not roll back prices. The memory is a cache: losing one entry costs one more match next time.
- **Checks are derived on read.** Totals check, duplicate check and "quantity looks misread" are computed by the detail route from stored rows, not stored as columns. No migration is needed for them.
- **Invoice purge is its own function.** `purgeExpiredInvoices` runs from the same daily cron, before `purgeExpiredTrash`, with its own 30 s budget. It is not a new stage inside `purgeExpiredTrash`, so `TrashPurgeCounts` and its strict in-memory test harness stay unchanged. Cost if wrong: two log lines per night instead of one.
- **Restaurant deletion finds invoice files by prefix.** Keys are `invoices/<restaurantId>/…`, so deleting a restaurant lists and deletes that prefix. Keys do not need to be collected before the cascade. Cost if wrong: a file stored under another prefix would survive; Task 8 is the only writer.
- **Minor #8 stays deferred.** On the gate, every number matched the paper except one quantity (G6), and that was a misreading, not a parsing slip. Cost if wrong: a rare "(12.50)" answer reads as null, which the chef sees as a line with no price.
- **Minor #12 goes to Plan 3.** Showing tax in the bank (net vs gross cost) is a screen change, made together with the product-form tax field. The API already stores `taxRatePct`, and apply sets it (Task 14).
- **Price history link** (spec "Connections") is Task 16: the history route returns `invoiceId`; Plan 3 draws the link.

---

### Task 1: Provider errors are logged and transient ones retried (G1)

The gate saw one `ai_provider_http_400` that succeeded on retry. `glm.ts` throws without the response body, so the cause was lost.

**Files:**
- Modify: `apps/api/lib/ai/glm.ts:60`
- Modify: `apps/api/lib/invoices/extraction.ts:162-175`
- Test: `apps/api/lib/ai/glm.test.ts`, `apps/api/lib/invoices/extraction.test.ts`

**Interfaces:**
- Consumes: `logger` (`apps/api/lib/logger`).
- Produces: no new exports. `extractInvoicePage` retries once on `ai_response_invalid`, `ai_provider_http_400` and `ai_provider_http_5xx` when the first attempt took under 25 s.

- [ ] **Step 1: Write the failing tests**

In `apps/api/lib/ai/glm.test.ts`, change the logger mock (line 3) so `error` exists:

```ts
vi.mock("../logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
```

Add inside `describe("GLM structured generation", ...)`:

```ts
  it("logs the provider error body before throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":{"code":"1210","message":"bad image"}}', { status: 400 })));
    await expect(generateGlmJson({ task: "extraction", system: "JSON", content: "Data" })).rejects.toThrow("ai_provider_http_400");
    expect(logger.error).toHaveBeenCalledWith("ai_provider_http_error", expect.objectContaining({
      provider: "zai", task: "extraction", status: 400, body: expect.stringContaining("bad image"),
    }));
  });
```

In `apps/api/lib/invoices/extraction.test.ts`, add inside `describe("extractInvoicePage", ...)`:

```ts
  it.each(["ai_provider_http_400", "ai_provider_http_502"])("retries once after a transient %s", async (code) => {
    glm.generateGlmJson.mockRejectedValueOnce(new Error(code));
    const page = await extractInvoicePage(new Uint8Array([1]), "image/png");
    expect(glm.generateGlmJson).toHaveBeenCalledTimes(2);
    expect(page.lines).toHaveLength(2);
  });

  it.each(["ai_provider_http_401", "ai_provider_http_429"])("does not retry %s", async (code) => {
    glm.generateGlmJson.mockRejectedValueOnce(new Error(code));
    await expect(extractInvoicePage(new Uint8Array([1]), "image/png")).rejects.toThrow(code);
    expect(glm.generateGlmJson).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec vitest run lib/ai/glm.test.ts lib/invoices/extraction.test.ts`
Expected: FAIL. The new glm test fails with `expected "spy" to be called`, and the two transient cases fail with `ai_provider_http_400` / `ai_provider_http_502` thrown after one call. The 401/429 cases pass; they pin existing behaviour.

- [ ] **Step 3: Implement**

`apps/api/lib/ai/glm.ts`, replace line 60:

```ts
  if (!response.ok) {
    // The body names the cause (bad image, content filter, quota); without it a 400 cannot be told apart.
    const body = (await response.text().catch(() => "")).slice(0, 500);
    logger.error("ai_provider_http_error", { provider: "zai", model: config.model, task: request.task, status: response.status, body });
    throw new Error(`ai_provider_http_${response.status}`);
  }
```

If `logger` is not yet imported in `glm.ts`, add `import { logger } from "../logger";` next to the other imports.

`apps/api/lib/invoices/extraction.ts`, replace the condition in `generateInvoiceJson`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec vitest run lib/ai/glm.test.ts lib/invoices/extraction.test.ts`
Expected: PASS, every test in both files.

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/ai/glm.ts apps/api/lib/ai/glm.test.ts apps/api/lib/invoices/extraction.ts apps/api/lib/invoices/extraction.test.ts
git commit -m "fix(invoices): log provider error bodies and retry transient failures once"
```

---

### Task 2: Reading prompt and line kinds (G2, G3 prompt, G5 prompt, G6, minor #13)

The gate turned these into fake lines:
- Scientific names and catch zones ("ARISTAEOMORPHA FOLIACEA PESCATO ZONA FAO 37…").
- A section header ("VENDITA MERCE").
- A crate deposit ("DIFFERENZA CAUZIONALE").

It also left pack content inside descriptions, computed `netTotal` when only the gross was printed, and missed a `C.IVA` column. A description over 300 characters dropped its whole line, and 200+ lines or `lines: null` failed the page.

The model now labels each line with a `kind`:
- `detail` lines are merged into the previous article.
- `header` lines are dropped.
- `charge` lines (deposits, transport, packaging) are kept for the totals but never become products.

A line with no kind stays an `item`. That keeps delivery notes whose lines carry only a description (Review Focus 1).

**Files:**
- Modify: `apps/api/lib/invoices/extraction.ts`
- Test: `apps/api/lib/invoices/extraction.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ExtractedInvoiceLine` gains `kind: "item" | "charge"`. Every other field is unchanged. Exported constants: `MAX_INVOICE_LINES = 200`, `MAX_LINE_DESCRIPTION = 300`.

- [ ] **Step 1: Write the failing tests**

In `extraction.test.ts`, the two `toEqual` assertions on whole lines gain `kind: "item"`. In "converts amounts to cents…" the expected line becomes:

```ts
    expect(page.lines[0]).toEqual({
      description: "Gamb.rosso mazara cal.3", code: "GR3", quantity: 1, unit: "cassa",
      packQty: 5, packUnit: "kg", unitPriceCents: 4000, taxRatePct: 10, lineTotalCents: 4000, kind: "item",
    });
```

In "keeps a delivery-note line without prices, with nulls" the expected line becomes:

```ts
    expect(page.lines).toEqual([{
      description: "Vongole veraci", code: null, quantity: null, unit: null, packQty: null,
      packUnit: null, unitPriceCents: null, taxRatePct: null, lineTotalCents: null, kind: "item",
    }]);
```

Add a new `describe` after `describe("parseInvoicePage", ...)`:

```ts
describe("parseInvoicePage — line kinds and limits", () => {
  const item = { description: "GAMBERO ROSSO CARPACCIO G 50 CONGELATO", quantity: 10, unit: "CF", unitPrice: 55.5, lineTotal: 555 };

  it("merges a detail line into the previous article", () => {
    const page = parseInvoicePage({ ...PAGE, lines: [item, { description: "ARISTAEOMORPHA FOLIACEA PESCATO ZONA FAO 37", kind: "detail" }] });
    expect(page.lines).toHaveLength(1);
    expect(page.lines[0]!.description).toBe("GAMBERO ROSSO CARPACCIO G 50 CONGELATO ARISTAEOMORPHA FOLIACEA PESCATO ZONA FAO 37");
  });

  it("drops a detail line with no article before it, and a header line", () => {
    const page = parseInvoicePage({ ...PAGE, lines: [{ description: "lotto 123", kind: "detail" }, { description: "VENDITA MERCE", kind: "header" }, item] });
    expect(page.lines.map((l) => l.description)).toEqual(["GAMBERO ROSSO CARPACCIO G 50 CONGELATO"]);
    expect(page.droppedLines).toBe(0);
  });

  it("keeps a deposit as a charge so it still counts in the totals", () => {
    const page = parseInvoicePage({ ...PAGE, lines: [item, { description: "DIFFERENZA CAUZIONALE", lineTotal: 2.58, kind: "charge" }] });
    expect(page.lines[1]).toMatchObject({ description: "DIFFERENZA CAUZIONALE", lineTotalCents: 258, kind: "charge" });
  });

  it("an unknown kind is an item", () => {
    expect(parseInvoicePage({ ...PAGE, lines: [{ ...item, kind: "banana" }] }).lines[0]!.kind).toBe("item");
  });

  it("truncates a long description instead of dropping the line", () => {
    const page = parseInvoicePage({ ...PAGE, lines: [{ ...item, description: "x".repeat(400) }] });
    expect(page.lines[0]!.description).toHaveLength(300);
    expect(page.droppedLines).toBe(0);
  });

  it("keeps the first 200 lines and counts the rest as dropped", () => {
    const page = parseInvoicePage({ ...PAGE, lines: Array.from({ length: 205 }, () => item) });
    expect(page.lines).toHaveLength(200);
    expect(page.droppedLines).toBe(5);
  });

  it("reads lines: null as no lines", () => {
    expect(parseInvoicePage({ ...PAGE, lines: null }).lines).toEqual([]);
  });
});

describe("extractInvoicePage — prompt", () => {
  it("asks for line kinds, pack content found in the description, printed totals only and the tax column", async () => {
    await extractInvoicePage(new Uint8Array([1]), "image/png");
    const req = glm.generateGlmJson.mock.calls[0]![0] as { system: string; schema: { properties: { lines: { items: { properties: Record<string, unknown> } } } } };
    expect(Object.keys(req.schema.properties.lines.items.properties)).toContain("kind");
    expect(req.system).toMatch(/pz24/);
    expect(req.system).toMatch(/nunca los calcules/);
    expect(req.system).toMatch(/C\.IVA/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/extraction.test.ts`
Expected: FAIL. The `toEqual` cases fail on the missing `kind`; merge, drop and charge fail; truncation fails with `toHaveLength(300)` on 0 lines; the 205-line case fails with `invoice_response_invalid`; `lines: null` throws; the prompt test fails on `kind`.

- [ ] **Step 3: Implement**

In `extraction.ts`:

1. Add `kind` to the type:

```ts
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
  // "charge": deposits, transport, packaging. Counted in the totals, never a product.
  kind: "item" | "charge";
};
```

2. Replace `LineSchema`, `PageSchema` and `parseInvoicePage`:

```ts
export const MAX_INVOICE_LINES = 200;
export const MAX_LINE_DESCRIPTION = 300;

const LineSchema = z.object({
  description: z.string().trim().min(1).transform((s) => s.slice(0, MAX_LINE_DESCRIPTION)),
  code: text(60),
  quantity: num,
  unit: text(30),
  packQty: num,
  packUnit: text(30),
  unitPrice: num,
  taxRatePct: num,
  lineTotal: num,
  kind: z.unknown().transform((v) => (v === "detail" || v === "header" || v === "charge" ? v : "item")),
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
  lines: z.array(z.unknown()).nullish().transform((v) => v ?? []),
});

export function parseInvoicePage(raw: unknown): ExtractedInvoicePage {
  const parsed = PageSchema.safeParse(raw);
  if (!parsed.success) throw new InvoiceExtractionError("invoice_response_invalid");
  const page = parsed.data;
  const rawLines = page.lines.slice(0, MAX_INVOICE_LINES);
  let droppedLines = page.lines.length - rawLines.length;
  const lines: ExtractedInvoiceLine[] = [];
  for (const rawLine of rawLines) {
    const line = LineSchema.safeParse(rawLine);
    if (!line.success) {
      droppedLines++;
      continue;
    }
    const l = line.data;
    if (l.kind === "header") continue;
    if (l.kind === "detail") {
      // Scientific name, catch zone, lot or origin printed under the article: it describes the article above.
      const previous = lines.at(-1);
      if (previous) previous.description = `${previous.description} ${l.description}`.slice(0, MAX_LINE_DESCRIPTION);
      continue;
    }
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
      kind: l.kind,
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
```

3. In `INVOICE_PAGE_JSON_SCHEMA`, change these descriptions and add `kind` to the line properties:

```ts
    netTotal: { ...optNumber, description: "total sin impuestos (imponibile) SOLO si está impreso; nunca lo calcules" },
    taxTotal: { ...optNumber, description: "total de impuestos SOLO si está impreso" },
    grossTotal: { ...optNumber, description: "total con impuestos SOLO si está impreso" },
```

```ts
          packQty: { ...optNumber, description: "contenido de UN envase cuando la línea vende envases (cassa, cartone, CF, conf., PZ de una caja); búscalo también en la descripción" },
          packUnit: { ...optString, description: "unidad del contenido de un envase: kg, g, l, ml o pz" },
          taxRatePct: { ...optNumber, description: "porcentaje de impuesto de la línea, solo si aparece (columna IVA, C.IVA, Aliq. o %; '04' es 4)" },
          kind: {
            type: "string",
            enum: ["item", "detail", "header", "charge"],
            description: "item: artículo; detail: renglón que sigue describiendo el artículo anterior; header: título de sección; charge: depósito, envases, transporte",
          },
```

4. Replace `INVOICE_SYSTEM`:

```ts
const INVOICE_SYSTEM = [
  "Eres un lector de facturas y albaranes de proveedores de restaurantes, de cualquier país e idioma.",
  "Devuelve SOLO lo que está escrito. No inventes datos: si un campo no aparece, omítelo.",
  "Incluye TODAS las líneas de artículos, una por renglón, en el mismo orden, también descuentos y devoluciones.",
  "No incluyas como línea los subtotales, totales ni resúmenes de impuestos.",
  "Los renglones sin precio que siguen describiendo el artículo anterior (nombre científico, zona de pesca FAO, lote, origen, 'allevato in...') van con kind 'detail'. Los títulos de sección como 'VENDITA MERCE' van con kind 'header'. Depósitos, envases retornables (cauzione, vuoti, imballi) y transporte van con kind 'charge'.",
  "Contenido del envase: si la línea vende cajas, confezioni (CF) o piezas que contienen varias unidades, pon en packQty/packUnit el contenido de UN envase, también cuando solo aparece en la descripción. Ejemplos: 'kg 1,75 - pz24' → packQty 24, packUnit 'pz'; '(G 1100 X 4)' → packQty 4.4, packUnit 'kg'; 10 CF con 'Kili: 4,000' → packQty 0.4, packUnit 'kg'.",
  "Copia la unidad de cada línea de su propia columna (NR, PZ, KG...), sin tomarla de otra línea.",
  "La columna de impuesto puede llamarse IVA, C.IVA, Aliq. o %; un código '04' significa 4.",
  "netTotal, taxTotal y grossTotal: solo si están impresos en el documento; nunca los calcules.",
  "Los importes son números con punto decimal, sin símbolo de moneda.",
].join("\n");
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/extraction.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the consumers**

Run: `cd apps/api && pnpm exec tsc --noEmit`
Expected: no errors. If `scripts/invoice-spike.ts` or any test builds an `ExtractedInvoiceLine` literal, add `kind: "item"` to it.

- [ ] **Step 6: Commit**

```bash
git add apps/api/lib/invoices/extraction.ts apps/api/lib/invoices/extraction.test.ts
git commit -m "fix(invoices): merge detail lines, keep charges apart and read pack content and printed totals only"
```

---

### Task 3: Pricing hardening (G3, G6, minors #6 and #7)

The gate's two pricing problems:
- Gillardeau oysters: 44 € for a box of 24 (`PZ`, "pz24" in the description) would become 44 € per oyster.
- Fagiolini: a misread quantity (2.5 instead of 2.58) made "total ÷ quantity" win over the printed price.

**Files:**
- Modify: `apps/api/lib/invoices/pricing.ts`
- Test: `apps/api/lib/invoices/pricing.test.ts`

**Interfaces:**
- Consumes: `convertUnit` (`apps/api/lib/products/cost.ts`).
- Produces:
  - `priceInBankUnit(input: { unitPriceCents; unit; packQty; packUnit; quantity; lineTotalCents; description?: string }, bankUnit: ProductUnit): number | null`.
  - `quantityLooksMisread(line: { quantity: number | null; unitPriceCents: number | null; lineTotalCents: number | null }): boolean`.
  - `proposeLine(input: { productId; currentPriceCents; currentPriceAt; newPriceCents; invoiceDate; kind?: "item" | "charge" }): LineProposal`.
  - `LineProposal` adds `{ action: "ignore"; priceCents: null; reason: "charge" }`.
  - `draftUnitFor(line: { unit: string | null; packQty: number | null; packUnit: string | null }): ProductUnit | null`.

- [ ] **Step 1: Write the failing tests**

In `pricing.test.ts`:

1. In `describe("normalizeInvoiceUnit")`, add rows to the table: `["CF", "caja"], ["conf.", "caja"], ["confezione", "caja"], ["NR", "unidad"]`.

2. In `describe("priceInBankUnit")`, add a `description` parameter to `p` and replace the "kilos to grams rounds to the cent" test:

```ts
  const p = (
    unitPriceCents: number | null,
    unit: string | null,
    packQty: number | null = null,
    packUnit: string | null = null,
    quantity: number | null = null,
    lineTotalCents: number | null = null,
    description = "",
  ) => ({ unitPriceCents, unit, packQty, packUnit, quantity, lineTotalCents, description });

  it("kilos to grams: a price that rounding would change by over 5% is not proposed", () =>
    expect(priceInBankUnit(p(1250, "kg"), "g")).toBeNull());
  it("kilos to grams for an expensive product survives rounding", () =>
    expect(priceInBankUnit(p(150000, "kg"), "g")).toBe(150));
  it("a box of 24 pieces sold per PZ becomes a price per piece", () =>
    expect(priceInBankUnit(p(4400, "PZ", 24, "pz"), "unidad")).toBe(183));
  it("a PZ line whose description prints a pack content that was not read: unsafe", () =>
    expect(priceInBankUnit(p(4400, "PZ", null, null, 1, 4400, "OSTRICA GILLARDEAU 4 (kg 1,75 -pz24)"), "unidad")).toBeNull());
  it("a CF line with 'G 1100 X 4' and no pack read: unsafe", () =>
    expect(priceInBankUnit(p(13200, "CF", null, null, 1, 13200, "FIORE DI CARCIOFO (G 1100 X 4)"), "kg")).toBeNull());
  it("a CF with its content read becomes a price per kilo", () =>
    expect(priceInBankUnit(p(5550, "CF", 0.4, "kg"), "kg")).toBe(13875));
  it("a piece with no pack hint stays a piece price", () =>
    expect(priceInBankUnit(p(650, "PZ", null, null, 6, 3900, "PANNA DA MONTARE MIN.35% 1 L"), "unidad")).toBe(650));
```

3. In `describe("price actually paid")`, add:

```ts
  it("a total above quantity × price means a misread quantity: the printed price stands", () =>
    expect(priceInBankUnit(line(645, 2.5, 1664), "kg")).toBe(645));
```

4. Add new describes:

```ts
describe("quantityLooksMisread", () => {
  it("flags a total above quantity × price", () =>
    expect(quantityLooksMisread({ quantity: 2.5, unitPriceCents: 645, lineTotalCents: 1664 })).toBe(true));
  it("a discount is not a misread", () =>
    expect(quantityLooksMisread({ quantity: 1, unitPriceCents: 1000, lineTotalCents: 850 })).toBe(false));
  it("rounding is not a misread", () =>
    expect(quantityLooksMisread({ quantity: 3, unitPriceCents: 333, lineTotalCents: 1000 })).toBe(false));
  it("missing numbers are not a misread", () =>
    expect(quantityLooksMisread({ quantity: null, unitPriceCents: 645, lineTotalCents: 1664 })).toBe(false));
});

describe("proposeLine — charges and the 20% threshold", () => {
  const base = { productId: "p1", currentPriceCents: 1000, currentPriceAt: new Date("2026-10-01T09:00:00Z"), invoiceDate: "2026-10-12" };

  it("a charge line is ignored, never a product", () =>
    expect(proposeLine({ ...base, productId: null, newPriceCents: 258, kind: "charge" })).toEqual({ action: "ignore", priceCents: null, reason: "charge" }));
  it("19.6% is pre-selected even though it rounds to 20", () =>
    expect(proposeLine({ ...base, newPriceCents: 1196 })).toMatchObject({ action: "update_price", changePct: 20, preselected: true }));
  it("exactly 20% needs a tick", () =>
    expect(proposeLine({ ...base, newPriceCents: 1200 })).toMatchObject({ changePct: 20, preselected: false }));
});

describe("draftUnitFor", () => {
  it("a case with known content drafts in the content unit", () =>
    expect(draftUnitFor({ unit: "cassa", packQty: 5, packUnit: "kg" })).toBe("kg"));
  it("a plain unit drafts in that unit", () => expect(draftUnitFor({ unit: "KG", packQty: null, packUnit: null })).toBe("kg"));
  it("an unknown unit has no draft unit", () => expect(draftUnitFor({ unit: "mazzo", packQty: null, packUnit: null })).toBeNull());
});
```

Update the import line: `import { draftUnitFor, normalizeInvoiceUnit, priceInBankUnit, proposeLine, quantityLooksMisread } from "./pricing";`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/pricing.test.ts`
Expected: FAIL. The new exports are undefined. "kilos to grams…" fails with `expected 1 to be null`, the PZ and CF cases fail, the misread case fails with `expected 666 to be 645`, and the 19.6% case fails with `preselected: false`.

- [ ] **Step 3: Implement**

In `pricing.ts`:

1. Add to `UNIT_ALIASES`: `cf: "caja", conf: "caja", confezione: "caja", confezioni: "caja"`. `nr` already exists.

2. Replace `pricePaidPerUnit` and `priceInBankUnit`, and add `quantityLooksMisread` and `draftUnitFor`:

```ts
// Last price PAID. A line discount ("Sc. 15%") prints a total below quantity × list price, so
// total / quantity wins. A total ABOVE it means the quantity was misread: the printed price stands.
function pricePaidPerUnit(input: { unitPriceCents: number | null; quantity: number | null; lineTotalCents: number | null }): number | null {
  const fromTotal =
    input.quantity !== null && input.quantity > 0 && input.lineTotalCents !== null && input.lineTotalCents > 0
      ? input.lineTotalCents / input.quantity
      : null;
  if (input.unitPriceCents === null) return fromTotal;
  if (fromTotal === null || fromTotal >= input.unitPriceCents - 1) return input.unitPriceCents;
  return fromTotal;
}

// The review screen asks the chef to check the quantity when the total cannot come from it.
export function quantityLooksMisread(line: { quantity: number | null; unitPriceCents: number | null; lineTotalCents: number | null }): boolean {
  if (line.quantity === null || line.unitPriceCents === null || line.lineTotalCents === null || line.quantity <= 0) return false;
  const expected = line.quantity * line.unitPriceCents;
  return line.lineTotalCents - expected > Math.max(2, expected * 0.01);
}

// Pack content printed in the description ("pz24", "1100 X 4", "kg 1,75", "Kili: 4"): if it was not read
// into packQty, a package price must not be taken as a unit price.
const PACK_HINT = /\b(?:pz|pezzi|pcs)\s*\d|\d\s*[x×]\s*\d|\b(?:kg|kili|g|gr|l|lt)\s*:?\s*\d/i;
const MAX_ROUNDING_ERROR = 0.05;

export function priceInBankUnit(
  input: {
    unitPriceCents: number | null;
    unit: string | null;
    packQty: number | null;
    packUnit: string | null;
    quantity: number | null;
    lineTotalCents: number | null;
    description?: string;
  },
  bankUnit: ProductUnit,
): number | null {
  // Returns, deposits and credit lines are never a purchase price.
  if ((input.quantity !== null && input.quantity < 0) || (input.lineTotalCents !== null && input.lineTotalCents < 0)) {
    return null;
  }
  const paidCents = pricePaidPerUnit(input);
  if (paidCents === null || !(paidCents > 0)) return null;
  const unit = normalizeInvoiceUnit(input.unit);
  if (unit === null) return null;

  let priceCents = paidCents;
  let perUnit: ProductUnit = unit;
  const isPackage = unit === "caja" || unit === "unidad";
  const packUnit = normalizeInvoiceUnit(input.packUnit);
  if (isPackage && input.packQty !== null && input.packQty > 0 && packUnit !== null) {
    priceCents = paidCents / input.packQty;
    perUnit = packUnit;
  } else if (isPackage && PACK_HINT.test(input.description ?? "")) {
    return null;
  }
  // How many `perUnit` fit in one bank unit (1 kg = 1000 g). Null when the
  // conversion needs a density or a pack content we do not have.
  const perUnitsInBankUnit = perUnit === bankUnit ? 1 : convertUnit(1, bankUnit, perUnit);
  if (perUnitsInBankUnit === null) return null;
  const exact = priceCents * perUnitsInBankUnit;
  const rounded = Math.round(exact);
  // Cents per gram or millilitre can lose most of the price in rounding (1.25 → 1): the chef enters it.
  if (rounded <= 0 || Math.abs(rounded - exact) / exact > MAX_ROUNDING_ERROR) return null;
  return rounded;
}

// The unit a new draft product gets: the pack content's unit when the line sells packages.
export function draftUnitFor(line: { unit: string | null; packQty: number | null; packUnit: string | null }): ProductUnit | null {
  const unit = normalizeInvoiceUnit(line.unit);
  const packUnit = normalizeInvoiceUnit(line.packUnit);
  if ((unit === "caja" || unit === "unidad") && line.packQty !== null && line.packQty > 0 && packUnit !== null) return packUnit;
  return unit;
}
```

3. Replace `LineProposal` and `proposeLine`:

```ts
export type LineProposal =
  | { action: "create_draft"; priceCents: number | null; preselected: true }
  | { action: "update_price"; priceCents: number; changePct: number | null; preselected: boolean }
  | { action: "connect"; priceCents: null; reason: "unsafe_conversion" | "older_invoice" | "same_price" }
  | { action: "ignore"; priceCents: null; reason: "charge" };

export function proposeLine(input: {
  productId: string | null;
  currentPriceCents: number;
  currentPriceAt: Date | null;
  newPriceCents: number | null;
  invoiceDate: string;
  kind?: "item" | "charge";
}): LineProposal {
  if (input.kind === "charge") return { action: "ignore", priceCents: null, reason: "charge" };
  if (input.productId === null) return { action: "create_draft", priceCents: input.newPriceCents, preselected: true };
  if (input.newPriceCents === null) return { action: "connect", priceCents: null, reason: "unsafe_conversion" };
  // No price yet: any paid price beats none. precioActualizadoAt is then just
  // the creation date (drafts from recipe imports), not a paid price's date.
  if (input.currentPriceCents <= 0) {
    return { action: "update_price", priceCents: input.newPriceCents, changePct: null, preselected: true };
  }
  // Compare calendar days: the invoice has a date, the price a timestamp.
  if (input.currentPriceAt && input.invoiceDate < input.currentPriceAt.toISOString().slice(0, 10)) {
    return { action: "connect", priceCents: null, reason: "older_invoice" };
  }
  if (input.newPriceCents === input.currentPriceCents) return { action: "connect", priceCents: null, reason: "same_price" };
  const exactPct = ((input.newPriceCents - input.currentPriceCents) / input.currentPriceCents) * 100;
  return { action: "update_price", priceCents: input.newPriceCents, changePct: Math.round(exactPct), preselected: Math.abs(exactPct) < BIG_CHANGE_PCT };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/pricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/invoices/pricing.ts apps/api/lib/invoices/pricing.test.ts
git commit -m "fix(invoices): never price a box as a unit, trust the printed price over a misread quantity"
```

---

### Task 4: Multi-page invoices and an honest totals check (G4, G5, G7, minor #9)

Three gate findings drive this task:
- Scelgo printed its lines on page 1 and its totals on page 2.
- Recchioni and DAC printed only the gross total. The model filled `netTotal` from its own lines, so "ok" proved nothing.
- A header line with no total turned the whole check into `unknown`.

`checkTotals` is replaced:
- The check skips lines with no total.
- It compares against the printed net total.
- When every priced line has a tax rate, it also checks the printed gross total, which catches a computed net. The Recchioni lines sum to 484.46 € gross against 490.26 € printed.

**Files:**
- Modify: `apps/api/lib/invoices/totals.ts` (rewrite: the file is under 20 lines)
- Modify: `apps/api/lib/invoices/totals.test.ts` (rewrite)
- Modify: `apps/api/scripts/invoice-spike.ts:32,51`

**Interfaces:**
- Consumes: `ExtractedInvoiceLine`, `ExtractedInvoicePage` (Task 2).
- Produces:
  - `type InvoiceHeader = { supplierName: string | null; supplierTaxId: string | null; invoiceNumber: string | null; invoiceDate: string | null; netTotalCents: number | null; taxTotalCents: number | null; grossTotalCents: number | null }`
  - `type MergedInvoice = { header: InvoiceHeader; lines: ExtractedInvoiceLine[]; droppedLines: number; invoicePages: number }`
  - `mergeInvoicePages(pages: ReadonlyArray<ExtractedInvoicePage>): MergedInvoice`
  - `type TotalsCheck = { status: "ok" | "mismatch" | "unknown"; sumCents: number | null; diffCents: number | null }`
  - `checkInvoiceTotals(lines: ReadonlyArray<{ lineTotalCents: number | null; taxRatePct: number | null }>, totals: { netTotalCents: number | null; grossTotalCents: number | null }): TotalsCheck`
  - `checkTotals` is removed.

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/lib/invoices/totals.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { ExtractedInvoicePage } from "./extraction";
import { checkInvoiceTotals, mergeInvoicePages } from "./totals";

const l = (lineTotalCents: number | null, taxRatePct: number | null = null) => ({ lineTotalCents, taxRatePct });

describe("checkInvoiceTotals", () => {
  it("ok when lines add up to the net total", () =>
    expect(checkInvoiceTotals([l(4000), l(1250)], { netTotalCents: 5250, grossTotalCents: null })).toEqual({ status: "ok", sumCents: 5250, diffCents: 0 }));
  it("tolerates rounding of one cent per line", () =>
    expect(checkInvoiceTotals([l(4003), l(3583), l(5994)], { netTotalCents: 13582, grossTotalCents: null }).status).toBe("ok"));
  it("mismatch when a line is missing", () =>
    expect(checkInvoiceTotals([l(4000)], { netTotalCents: 5250, grossTotalCents: null })).toEqual({ status: "mismatch", sumCents: 4000, diffCents: -1250 }));
  it("counts discount and deposit lines with their sign", () =>
    expect(checkInvoiceTotals([l(5000), l(-500), l(258)], { netTotalCents: 4758, grossTotalCents: null }).status).toBe("ok"));
  it("lines without a total are left out instead of making the check unknown", () =>
    expect(checkInvoiceTotals([l(null), l(4000), l(1250)], { netTotalCents: 5250, grossTotalCents: null }).status).toBe("ok"));
  it("unknown when no line has a total", () =>
    expect(checkInvoiceTotals([l(null)], { netTotalCents: 5250, grossTotalCents: null }).status).toBe("unknown"));
  it("unknown when no total is printed", () =>
    expect(checkInvoiceTotals([l(4000, 10)], { netTotalCents: null, grossTotalCents: null }).status).toBe("unknown"));
  it("checks the gross total when only the gross is printed and every line has a rate", () =>
    expect(checkInvoiceTotals([l(14200, 10)], { netTotalCents: null, grossTotalCents: 15620 }).status).toBe("ok"));
  it("a net that matches the lines but a gross that does not is a mismatch (computed net)", () =>
    expect(checkInvoiceTotals([l(4400, 22), l(2400, 22), l(36500, 10)], { netTotalCents: 43300, grossTotalCents: 49026 }))
      .toEqual({ status: "mismatch", sumCents: 43300, diffCents: -580 }));
  it("skips the gross check when a priced line has no rate", () =>
    expect(checkInvoiceTotals([l(4000, 10), l(1250)], { netTotalCents: 5250, grossTotalCents: 99999 }).status).toBe("ok"));
});

const page = (over: Partial<ExtractedInvoicePage>): ExtractedInvoicePage => ({
  isInvoice: true, supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
  netTotalCents: null, taxTotalCents: null, grossTotalCents: null, lines: [], droppedLines: 0, ...over,
});
const line = (description: string) => ({
  description, code: null, quantity: 1, unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 100, taxRatePct: 10, lineTotalCents: 100, kind: "item" as const,
});

describe("mergeInvoicePages", () => {
  it("lines from every page in order, identity from the first page that has it, totals from the last", () => {
    const merged = mergeInvoicePages([
      page({ supplierName: "SCELGO SPA", invoiceNumber: "0326413/20", invoiceDate: "2026-03-26", lines: [line("TONNO"), line("RICCIOLA")], droppedLines: 1 }),
      page({ supplierName: "Scelgo SPA (C&C San Benedetto)", netTotalCents: 61650, grossTotalCents: 68534 }),
    ]);
    expect(merged.header).toEqual({
      supplierName: "SCELGO SPA", supplierTaxId: null, invoiceNumber: "0326413/20", invoiceDate: "2026-03-26",
      netTotalCents: 61650, taxTotalCents: null, grossTotalCents: 68534,
    });
    expect(merged.lines.map((x) => x.description)).toEqual(["TONNO", "RICCIOLA"]);
    expect(merged.droppedLines).toBe(1);
    expect(merged.invoicePages).toBe(2);
  });

  it("pages that are not an invoice add nothing", () => {
    const merged = mergeInvoicePages([page({ isInvoice: false, supplierName: "Selfie", lines: [line("x")] }), page({ supplierName: "MARR" })]);
    expect(merged.header.supplierName).toBe("MARR");
    expect(merged.lines).toEqual([]);
    expect(merged.invoicePages).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/totals.test.ts`
Expected: FAIL with `checkInvoiceTotals is not a function`, and the same for `mergeInvoicePages`.

- [ ] **Step 3: Implement**

Replace `apps/api/lib/invoices/totals.ts` with:

```ts
// Guards against the model skipping rows in dense tables: the read lines must add up to the totals
// printed on the invoice, allowing one cent of rounding per line. Multi-page invoices are merged first.
import type { ExtractedInvoiceLine, ExtractedInvoicePage } from "./extraction";

export type InvoiceHeader = {
  supplierName: string | null;
  supplierTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  netTotalCents: number | null;
  taxTotalCents: number | null;
  grossTotalCents: number | null;
};

export type MergedInvoice = { header: InvoiceHeader; lines: ExtractedInvoiceLine[]; droppedLines: number; invoicePages: number };

const IDENTITY = ["supplierName", "supplierTaxId", "invoiceNumber", "invoiceDate"] as const;
const TOTALS = ["netTotalCents", "taxTotalCents", "grossTotalCents"] as const;

// Who and when are printed on the first page; the totals at the end of the last one.
export function mergeInvoicePages(pages: ReadonlyArray<ExtractedInvoicePage>): MergedInvoice {
  const invoice = pages.filter((p) => p.isInvoice);
  const header = {} as InvoiceHeader;
  for (const key of IDENTITY) header[key] = invoice.find((p) => p[key] !== null)?.[key] ?? null;
  for (const key of TOTALS) header[key] = [...invoice].reverse().find((p) => p[key] !== null)?.[key] ?? null;
  return {
    header,
    lines: invoice.flatMap((p) => p.lines),
    droppedLines: invoice.reduce((n, p) => n + p.droppedLines, 0),
    invoicePages: invoice.length,
  };
}

export type TotalsCheck = { status: "ok" | "mismatch" | "unknown"; sumCents: number | null; diffCents: number | null };

export function checkInvoiceTotals(
  lines: ReadonlyArray<{ lineTotalCents: number | null; taxRatePct: number | null }>,
  totals: { netTotalCents: number | null; grossTotalCents: number | null },
): TotalsCheck {
  const priced = lines.filter((l): l is { lineTotalCents: number; taxRatePct: number | null } => l.lineTotalCents !== null);
  if (priced.length === 0) return { status: "unknown", sumCents: null, diffCents: null };
  const sumCents = priced.reduce((a, l) => a + l.lineTotalCents, 0);
  const tolerance = Math.max(2, priced.length);
  const diffs: number[] = [];
  if (totals.netTotalCents !== null) diffs.push(sumCents - totals.netTotalCents);
  // The model may compute a net that is not printed; the printed gross catches that when every line has a rate.
  if (totals.grossTotalCents !== null && priced.every((l) => l.taxRatePct !== null)) {
    const grossSum = priced.reduce((a, l) => a + Math.round(l.lineTotalCents * (1 + (l.taxRatePct as number) / 100)), 0);
    diffs.push(grossSum - totals.grossTotalCents);
  }
  if (diffs.length === 0) return { status: "unknown", sumCents, diffCents: null };
  const failing = diffs.find((d) => Math.abs(d) > tolerance);
  return failing === undefined ? { status: "ok", sumCents, diffCents: diffs[0]! } : { status: "mismatch", sumCents, diffCents: failing };
}
```

In `apps/api/scripts/invoice-spike.ts`, replace the import of `checkTotals` with `import { checkInvoiceTotals } from "../lib/invoices/totals";`, and replace the `totals` line with:

```ts
      const totals = checkInvoiceTotals(page.lines, page);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/totals.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, and no type errors (no other code imports `checkTotals`; confirm with `rg -n "checkTotals" apps/api` → no hits).

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/invoices/totals.ts apps/api/lib/invoices/totals.test.ts apps/api/scripts/invoice-spike.ts
git commit -m "fix(invoices): check totals per invoice across pages and against the printed gross"
```

---

### Task 5: Supplier memory and line matching (spec "Match", approach C)

The order per line is:
1. Supplier memory by code.
2. Supplier memory by normalized description.
3. `findMatch`, which gives exact, ambiguo, probable or none.
4. For lines still probable or none, ONE short AI call for the whole invoice, with each line's top 5 candidates. The call itself is Task 6; this task takes it as an injected function.

Charge lines (deposits, transport) are never matched. The names in the tests are the real suppliers from the gate.

Verified behaviour of `findMatch` (2026-10-15):
- `"Calamari puliti congelati IQF 3P"` against `"Calamari puliti"` gives `probable`.
- `"COZZA (ARBOREA)"` against `"Cozze"` gives `none`.
- `"Gambero rosso"` with two siblings gives `ambiguo` with `productId: null`.

**Files:**
- Create: `apps/api/lib/invoices/line-matching.ts`
- Test: `apps/api/lib/invoices/line-matching.test.ts`

**Interfaces:**
- Consumes:
  - `findMatch(query, candidates): MatchResult` and `tokenizeForMatch(s): string[]`, from `apps/api/lib/products/matching.ts`.
  - `MatchCandidate`.
  - `ExtractedInvoiceLine` (Task 2).
- Produces:
  - `normalizeSupplierName(name: string): string`
  - `normalizeDescription(text: string): string`
  - `normalizeCode(code: string | null): string | null`
  - `type SupplierMemoryEntry = { code: string | null; descriptionNorm: string; productId: string; packQty: number | null; packUnit: string | null }`
  - `type LineMatchLevel = "memory" | "exact" | "ai" | "probable" | "ambiguo" | "none" | "charge"`
  - `type LineMatch = { productId: string | null; level: LineMatchLevel; packQty: number | null; packUnit: string | null }`
  - `type SecondLookRequest = { position: number; description: string; candidates: Array<{ id: string; name: string }> }`
  - `type SecondLook = (requests: SecondLookRequest[]) => Promise<Map<number, string | null>>`
  - `topCandidates(query: string, candidates: ReadonlyArray<MatchCandidate>, limit?: number): MatchCandidate[]`
  - `matchInvoiceLines(input: { lines: ReadonlyArray<Pick<ExtractedInvoiceLine, "description" | "code" | "packQty" | "packUnit" | "kind">>; memory: ReadonlyArray<SupplierMemoryEntry>; candidates: ReadonlyArray<MatchCandidate>; secondLook: SecondLook }): Promise<LineMatch[]>`. The result keeps the order of `lines`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/lib/invoices/line-matching.test.ts
import { describe, expect, it, vi } from "vitest";
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
import {
  matchInvoiceLines, normalizeCode, normalizeDescription, normalizeSupplierName, topCandidates,
  type SecondLook, type SupplierMemoryEntry,
} from "./line-matching";

const candidates = [
  { id: "calamari", name: "Calamari puliti", aliases: [] },
  { id: "cozze", name: "Cozze", aliases: [] },
  { id: "branzino", name: "Branzino", aliases: [] },
  { id: "g1", name: "Gambero rosso Mazara", aliases: [] },
  { id: "g2", name: "Gambero rosso Sicilia", aliases: [] },
];
const line = (description: string, over: Partial<{ code: string | null; packQty: number | null; packUnit: string | null; kind: "item" | "charge" }> = {}) =>
  ({ description, code: null, packQty: null, packUnit: null, kind: "item" as const, ...over });
const noLook: SecondLook = async () => new Map();

describe("normalizers", () => {
  it.each([
    ["JOLANDA DE COLO' spa", "jolanda de colo"],
    ["Jolanda De Colò S.p.A.", "jolanda de colo"],
    ["Scelgo SPA (C&C San Benedetto del Tronto)", "scelgo"],
    ["Recchioni Primo e Adolfo s.r.l.", "recchioni primo e adolfo"],
    ["GARDEN FRUIT s.r.l.", "garden fruit"],
  ])("supplier %j -> %j", (raw, expected) => expect(normalizeSupplierName(raw)).toBe(expected));

  it("description folds case, accents and punctuation", () =>
    expect(normalizeDescription("PIE' D'ASINO  Ñandú")).toBe("pie d asino nandu"));
  it.each([[" FRU 108 ", "FRU108"], ["", null], ["   ", null], [null, null]])("code %j -> %j", (raw, expected) =>
    expect(normalizeCode(raw)).toBe(expected));
});

describe("topCandidates", () => {
  it("ranks by shared words and leaves out products sharing none", () =>
    expect(topCandidates("Calamari puliti congelati IQF", candidates).map((c) => c.id)).toEqual(["calamari"]));
  it("returns at most the limit", () =>
    expect(topCandidates("gambero rosso", candidates, 1)).toHaveLength(1));
});

describe("matchInvoiceLines", () => {
  const memory: SupplierMemoryEntry[] = [
    { code: "CC3PPU", descriptionNorm: "calamari 3p puliti", productId: "calamari", packQty: null, packUnit: null },
    { code: null, descriptionNorm: "cozza arborea", productId: "cozze", packQty: 5, packUnit: "kg" },
  ];

  it("supplier memory by code wins over everything", async () => {
    const [m] = await matchInvoiceLines({ lines: [line("anything", { code: "CC3PPU" })], memory, candidates, secondLook: noLook });
    expect(m).toEqual({ productId: "calamari", level: "memory", packQty: null, packUnit: null });
  });

  it("supplier memory by description fills a pack the line did not print", async () => {
    const [m] = await matchInvoiceLines({ lines: [line("COZZA (ARBOREA)")], memory, candidates, secondLook: noLook });
    expect(m).toEqual({ productId: "cozze", level: "memory", packQty: 5, packUnit: "kg" });
  });

  it("a pack printed on the line wins over the remembered one", async () => {
    const [m] = await matchInvoiceLines({ lines: [line("COZZA (ARBOREA)", { packQty: 10, packUnit: "kg" })], memory, candidates, secondLook: noLook });
    expect(m).toMatchObject({ packQty: 10, packUnit: "kg" });
  });

  it("an exact bank match needs no AI", async () => {
    const secondLook = vi.fn<SecondLook>(async () => new Map());
    const [m] = await matchInvoiceLines({ lines: [line("Calamari puliti")], memory: [], candidates, secondLook });
    expect(m).toMatchObject({ productId: "calamari", level: "exact" });
    expect(secondLook).not.toHaveBeenCalled();
  });

  it("an ambiguous family is left for the chef, not the AI", async () => {
    const secondLook = vi.fn<SecondLook>(async () => new Map());
    const [m] = await matchInvoiceLines({ lines: [line("Gambero rosso")], memory: [], candidates, secondLook });
    expect(m).toMatchObject({ productId: null, level: "ambiguo" });
    expect(secondLook).not.toHaveBeenCalled();
  });

  it("charge lines are never matched", async () => {
    const [m] = await matchInvoiceLines({ lines: [line("DIFFERENZA CAUZIONALE", { kind: "charge" })], memory, candidates, secondLook: noLook });
    expect(m).toMatchObject({ productId: null, level: "charge" });
  });

  it("doubtful lines go to one AI call with their candidates; a valid pick becomes level ai", async () => {
    const secondLook = vi.fn<SecondLook>(async () => new Map([[0, "calamari"]]));
    const result = await matchInvoiceLines({
      lines: [line("Calamari puliti congelati IQF 3P"), line("Calamari puliti")],
      memory: [], candidates, secondLook,
    });
    expect(secondLook).toHaveBeenCalledTimes(1);
    expect(secondLook.mock.calls[0]![0]).toEqual([
      { position: 0, description: "Calamari puliti congelati IQF 3P", candidates: [{ id: "calamari", name: "Calamari puliti" }] },
    ]);
    expect(result[0]).toMatchObject({ productId: "calamari", level: "ai" });
    expect(result[1]).toMatchObject({ level: "exact" });
  });

  it("an AI pick outside the line's candidates is ignored", async () => {
    const [m] = await matchInvoiceLines({
      lines: [line("Calamari puliti congelati IQF 3P")], memory: [], candidates,
      secondLook: async () => new Map([[0, "branzino"]]),
    });
    expect(m).toMatchObject({ productId: "calamari", level: "probable" });
  });

  it("when the AI call fails, lines keep their rule-based level", async () => {
    const [m] = await matchInvoiceLines({
      lines: [line("Calamari puliti congelati IQF 3P")], memory: [], candidates,
      secondLook: async () => { throw new Error("ai_provider_http_503"); },
    });
    expect(m).toMatchObject({ productId: "calamari", level: "probable" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/line-matching.test.ts`
Expected: FAIL with `Failed to resolve import "./line-matching"`.

- [ ] **Step 3: Implement**

```ts
// apps/api/lib/invoices/line-matching.ts
// Connects invoice lines to bank products (spec approach C): supplier memory first, then the
// bank rules, then one AI call for the lines the rules leave in doubt. Families with several
// siblings (ambiguo) are the chef's call, never the AI's.
import { findMatch, tokenizeForMatch, type MatchCandidate } from "../products/matching";
import { logger } from "../logger";
import type { ExtractedInvoiceLine } from "./extraction";

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Legal forms after folding ("S.p.A." -> "s p a"), so one supplier printed two ways is one supplier.
const LEGAL_FORMS = /\b(?:s ?r ?l ?s?|s ?p ?a|s ?a ?s|s ?n ?c|s ?l ?u|s ?l|s ?a|ltd|limited|gmbh|inc|llc|b ?v|sarl)\b/g;

export function normalizeSupplierName(name: string): string {
  return fold(name.replace(/\([^)]*\)/g, " ")).replace(LEGAL_FORMS, " ").replace(/\s+/g, " ").trim();
}

export function normalizeDescription(text: string): string {
  return fold(text);
}

export function normalizeCode(code: string | null): string | null {
  const value = code?.replace(/\s+/g, "").toUpperCase() ?? "";
  return value === "" ? null : value;
}

export type SupplierMemoryEntry = { code: string | null; descriptionNorm: string; productId: string; packQty: number | null; packUnit: string | null };
export type LineMatchLevel = "memory" | "exact" | "ai" | "probable" | "ambiguo" | "none" | "charge";
export type LineMatch = { productId: string | null; level: LineMatchLevel; packQty: number | null; packUnit: string | null };
export type SecondLookRequest = { position: number; description: string; candidates: Array<{ id: string; name: string }> };
export type SecondLook = (requests: SecondLookRequest[]) => Promise<Map<number, string | null>>;

const SECOND_LOOK_CANDIDATES = 5;

export function topCandidates(query: string, candidates: ReadonlyArray<MatchCandidate>, limit = SECOND_LOOK_CANDIDATES): MatchCandidate[] {
  const q = new Set(tokenizeForMatch(query));
  if (q.size === 0) return [];
  const score = (text: string) => {
    const t = new Set(tokenizeForMatch(text));
    let shared = 0;
    for (const word of t) if (q.has(word)) shared++;
    return shared === 0 ? 0 : shared / (q.size + t.size - shared);
  };
  return candidates
    .map((c) => ({ c, s: Math.max(score(c.name), ...c.aliases.map(score)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.name.length - b.c.name.length)
    .slice(0, limit)
    .map((x) => x.c);
}

export async function matchInvoiceLines(input: {
  lines: ReadonlyArray<Pick<ExtractedInvoiceLine, "description" | "code" | "packQty" | "packUnit" | "kind">>;
  memory: ReadonlyArray<SupplierMemoryEntry>;
  candidates: ReadonlyArray<MatchCandidate>;
  secondLook: SecondLook;
}): Promise<LineMatch[]> {
  const byCode = new Map(input.memory.flatMap((m) => (m.code ? [[m.code, m] as const] : [])));
  const byDescription = new Map(input.memory.map((m) => [m.descriptionNorm, m] as const));
  const results: LineMatch[] = [];
  const doubtful: SecondLookRequest[] = [];

  input.lines.forEach((line, position) => {
    const ownPack = { packQty: line.packQty, packUnit: line.packUnit };
    if (line.kind === "charge") {
      results.push({ productId: null, level: "charge", ...ownPack });
      return;
    }
    const code = normalizeCode(line.code);
    const remembered = (code ? byCode.get(code) : undefined) ?? byDescription.get(normalizeDescription(line.description));
    if (remembered) {
      const pack = line.packQty !== null ? ownPack : { packQty: remembered.packQty, packUnit: remembered.packUnit };
      results.push({ productId: remembered.productId, level: "memory", ...pack });
      return;
    }
    const match = findMatch(line.description, input.candidates);
    if (match.level === "exact" || match.level === "ambiguo") {
      results.push({ productId: match.level === "exact" ? match.productId : null, level: match.level, ...ownPack });
      return;
    }
    results.push({ productId: match.level === "probable" ? match.productId : null, level: match.level, ...ownPack });
    const top = topCandidates(line.description, input.candidates);
    const suggested = match.productId ? input.candidates.find((c) => c.id === match.productId) : undefined;
    if (suggested && !top.some((c) => c.id === suggested.id)) top.unshift(suggested);
    if (top.length > 0) {
      doubtful.push({ position, description: line.description, candidates: top.slice(0, SECOND_LOOK_CANDIDATES).map((c) => ({ id: c.id, name: c.name })) });
    }
  });

  if (doubtful.length === 0) return results;
  let answers = new Map<number, string | null>();
  try {
    answers = await input.secondLook(doubtful);
  } catch (error) {
    // The second look only improves matches: without it the chef still reviews every doubtful line.
    logger.warn("invoice_second_look_failed", { lines: doubtful.length, message: error instanceof Error ? error.message : String(error) });
  }
  for (const request of doubtful) {
    const picked = answers.get(request.position);
    if (picked && request.candidates.some((c) => c.id === picked)) {
      results[request.position] = { ...results[request.position]!, productId: picked, level: "ai" };
    }
  }
  return results;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/line-matching.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/invoices/line-matching.ts apps/api/lib/invoices/line-matching.test.ts
git commit -m "feat(invoices): match lines through supplier memory, bank rules and one AI second look"
```

---

### Task 6: The AI second look

**Files:**
- Create: `apps/api/lib/invoices/second-look.ts`
- Test: `apps/api/lib/invoices/second-look.test.ts`

**Interfaces:**
- Consumes: `generateGlmJson` (`apps/api/lib/ai/glm.ts`); `UsageCallback` (`apps/api/lib/ai/types`); `SecondLookRequest` (Task 5).
- Produces: `secondLook(requests: SecondLookRequest[], onUsage?: UsageCallback): Promise<Map<number, string | null>>`. It never returns an id outside that line's candidates.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/lib/invoices/second-look.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { glm } = vi.hoisted(() => ({ glm: { generateGlmJson: vi.fn() } }));
vi.mock("../ai/glm", () => glm);
import { secondLook } from "./second-look";

const requests = [
  { position: 0, description: "CALAMARI 3P PULITI IQF", candidates: [{ id: "calamari", name: "Calamari puliti" }] },
  { position: 3, description: "FASOLARO", candidates: [{ id: "fasolari", name: "Fasolari" }, { id: "vongole", name: "Vongole" }] },
];

beforeEach(() => glm.generateGlmJson.mockReset());

describe("secondLook", () => {
  it("makes no call when nothing is in doubt", async () => {
    expect(await secondLook([])).toEqual(new Map());
    expect(glm.generateGlmJson).not.toHaveBeenCalled();
  });

  it("sends every doubtful line with its candidates in one text call", async () => {
    glm.generateGlmJson.mockResolvedValue({ answers: [] });
    await secondLook(requests);
    expect(glm.generateGlmJson).toHaveBeenCalledTimes(1);
    const req = glm.generateGlmJson.mock.calls[0]![0] as { task: string; content: string };
    expect(req.task).toBe("extraction");
    expect(JSON.parse(req.content)).toEqual({ lines: requests });
  });

  it("keeps picks among the line's candidates and nulls the rest", async () => {
    glm.generateGlmJson.mockResolvedValue({ answers: [{ position: 0, productId: "calamari" }, { position: 3, productId: "calamari" }, { position: 9, productId: "x" }] });
    expect(await secondLook(requests)).toEqual(new Map([[0, "calamari"], [3, null]]));
  });

  it("a malformed answer means no picks", async () => {
    glm.generateGlmJson.mockResolvedValue({ answers: "nope" });
    expect(await secondLook(requests)).toEqual(new Map());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/second-look.test.ts`
Expected: FAIL with `Failed to resolve import "./second-look"`.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/second-look.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/invoices/second-look.ts apps/api/lib/invoices/second-look.test.ts
git commit -m "feat(invoices): AI second look limited to each line's candidates"
```

---

### Task 7: `uploading` invoice status (migration)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (`enum InvoiceStatus`, near line 826)
- Create: `packages/db/prisma/migrations/20261016090000_invoice_uploading_status/migration.sql`

**Interfaces:**
- Produces: `InvoiceStatus` = `uploading | reading | review | applied | failed`. The default for `Invoice.status` stays `reading`; routes set `uploading` explicitly.

**Test exception:** a schema enum has no runnable RED. The checks are `prisma validate`, client generation, the typecheck, and an independent verifier, which the user asked for on every migration.

- [ ] **Step 1: Edit the schema by hand.** Do NOT run `prisma format`: in Plan 1 it reformatted the whole file.

```prisma
enum InvoiceStatus {
  uploading
  reading
  review
  applied
  failed
}
```

- [ ] **Step 2: Write the migration**

```sql
-- Invoices are created while their pages upload (one request per page) and start reading afterwards.
ALTER TYPE "InvoiceStatus" ADD VALUE 'uploading' BEFORE 'reading';
```

- [ ] **Step 3: Validate and generate**

Run: `cd packages/db && DATABASE_URL="postgresql://u:p@localhost:5432/x" pnpm exec prisma validate && pnpm exec prisma generate`
Expected: `The schema at prisma/schema.prisma is valid`, then `Generated Prisma Client`.

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Independent verifier.** Dispatch a fresh reviewer with the migration, the schema diff and this task. It checks:
  - the migration is additive;
  - no code compares the status with `<`/`>` on enum order;
  - Postgres accepts `ADD VALUE … BEFORE` outside a transaction block, the way Prisma runs single-statement migrations.

  Expected: PASS. A FAIL is fixed before Step 5.

- [ ] **Step 5: Apply to the dev database only**

Load `DATABASE_URL` from `apps/api/.env.local` without printing it. Confirm the host is the dev branch (`ep-summer-heart`), then run:

Run: `pnpm --filter @atelier/db exec prisma migrate deploy`
Expected: `1 migration applied` (`20261016090000_invoice_uploading_status`). Never run it against production.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20261016090000_invoice_uploading_status/migration.sql
git commit -m "feat(db): uploading status for invoices whose pages are still arriving"
```

---

### Task 8: Private invoice file storage

Vercel Blob 2.3.3 (installed) supports `access: "private"`:
- `put(pathname, body, { access: "private" })` stores a file.
- `get(pathname, { access: "private" })` returns `{ statusCode: 200, stream, blob: { contentType } }`, or `null`.

Files are read back only by authenticated routes. A dedicated private store can be set with `INVOICE_BLOB_READ_WRITE_TOKEN`; without it, `BLOB_READ_WRITE_TOKEN` is used.

**Files:**
- Create: `apps/api/lib/invoices/storage.ts`
- Create: `apps/api/scripts/invoice-storage-smoke.ts`
- Test: `apps/api/lib/invoices/storage.test.ts`

**Interfaces:**
- Produces:
  - `class InvoiceStorageError extends Error`, with codes `invoice_storage_unconfigured` and `invoice_storage_unavailable`.
  - `storeInvoiceFile(restaurantId: string, invoiceId: string, buffer: Uint8Array, mimeType: string): Promise<string>`, which returns the storage key (pathname).
  - `openInvoiceFile(storageKey: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null>`
  - `readInvoiceFile(storageKey: string): Promise<Uint8Array | null>`
  - `deleteInvoiceFiles(storageKeys: ReadonlyArray<string>): Promise<void>`, which never throws.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/lib/invoices/storage.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { blob } = vi.hoisted(() => ({ blob: { put: vi.fn(), get: vi.fn(), del: vi.fn() } }));
vi.mock("@vercel/blob", () => blob);
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
import { deleteInvoiceFiles, readInvoiceFile, storeInvoiceFile } from "./storage";

beforeEach(() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "shared");
  vi.stubEnv("INVOICE_BLOB_READ_WRITE_TOKEN", "");
  blob.put.mockReset().mockImplementation(async (pathname: string) => ({ pathname }));
  blob.get.mockReset();
  blob.del.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("invoice storage", () => {
  it("stores privately under the restaurant and invoice and returns the key", async () => {
    const key = await storeInvoiceFile("r1", "inv1", new Uint8Array([1, 2]), "application/pdf");
    expect(key).toMatch(/^invoices\/r1\/inv1\/[0-9a-f-]{36}\.pdf$/);
    expect(blob.put).toHaveBeenCalledWith(key, expect.any(Buffer), expect.objectContaining({ access: "private", contentType: "application/pdf", token: "shared" }));
  });

  it("prefers the dedicated invoice store token", async () => {
    vi.stubEnv("INVOICE_BLOB_READ_WRITE_TOKEN", "invoices-only");
    await storeInvoiceFile("r1", "inv1", new Uint8Array([1]), "image/jpeg");
    expect(blob.put.mock.calls[0]![2]).toMatchObject({ token: "invoices-only" });
  });

  it("fails clearly without any token", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await expect(storeInvoiceFile("r1", "inv1", new Uint8Array([1]), "image/jpeg")).rejects.toThrow("invoice_storage_unconfigured");
  });

  it("a storage outage becomes invoice_storage_unavailable", async () => {
    blob.put.mockRejectedValue(new Error("503"));
    await expect(storeInvoiceFile("r1", "inv1", new Uint8Array([1]), "image/jpeg")).rejects.toThrow("invoice_storage_unavailable");
  });

  it("reads the bytes back, and null when the file is gone", async () => {
    blob.get.mockResolvedValueOnce({ statusCode: 200, stream: new Response(new Uint8Array([7, 8])).body, blob: { contentType: "image/jpeg" } });
    expect(await readInvoiceFile("invoices/r1/inv1/a.jpg")).toEqual(new Uint8Array([7, 8]));
    blob.get.mockResolvedValueOnce(null);
    expect(await readInvoiceFile("invoices/r1/inv1/b.jpg")).toBeNull();
    expect(blob.get).toHaveBeenCalledWith("invoices/r1/inv1/a.jpg", expect.objectContaining({ access: "private" }));
  });

  it("deleting never throws", async () => {
    blob.del.mockRejectedValue(new Error("down"));
    await expect(deleteInvoiceFiles(["invoices/r1/inv1/a.jpg"])).resolves.toBeUndefined();
    await deleteInvoiceFiles([]);
    expect(blob.del).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/storage.test.ts`
Expected: FAIL with `Failed to resolve import "./storage"`.

- [ ] **Step 3: Implement**

```ts
// apps/api/lib/invoices/storage.ts
// Invoice photos and PDFs are private (spec "Errors → Privacy"): stored with access "private" and
// read back only by authenticated routes. Keys are never sent to clients.
import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { logger } from "../logger";

export class InvoiceStorageError extends Error {}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

function token(): string {
  const value = process.env.INVOICE_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!value) throw new InvoiceStorageError("invoice_storage_unconfigured");
  return value;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function storeInvoiceFile(restaurantId: string, invoiceId: string, buffer: Uint8Array, mimeType: string): Promise<string> {
  const pathname = `invoices/${restaurantId}/${invoiceId}/${randomUUID()}.${EXT[mimeType] ?? "bin"}`;
  const auth = token();
  try {
    const stored = await put(pathname, Buffer.from(buffer), { access: "private", contentType: mimeType, addRandomSuffix: false, token: auth });
    return stored.pathname;
  } catch (error) {
    logger.error("invoice_storage_put_failed", { message: message(error) });
    throw new InvoiceStorageError("invoice_storage_unavailable");
  }
}

export async function openInvoiceFile(storageKey: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  const result = await get(storageKey, { access: "private", token: token() });
  if (!result || result.statusCode !== 200) return null;
  return { stream: result.stream, contentType: result.blob.contentType };
}

export async function readInvoiceFile(storageKey: string): Promise<Uint8Array | null> {
  const file = await openInvoiceFile(storageKey);
  return file ? new Uint8Array(await new Response(file.stream).arrayBuffer()) : null;
}

export async function deleteInvoiceFiles(storageKeys: ReadonlyArray<string>): Promise<void> {
  if (storageKeys.length === 0) return;
  try {
    await del([...storageKeys], { token: token() });
  } catch (error) {
    logger.warn("invoice_storage_delete_failed", { count: storageKeys.length, message: message(error) });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/storage.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 5: Smoke-test the real dev store** (the spec's open point "private-access option")

```ts
// apps/api/scripts/invoice-storage-smoke.ts
// Checks that the configured Blob store accepts private files: put, read back, delete.
// Uso: cd apps/api && ../../packages/db/node_modules/.bin/tsx scripts/invoice-storage-smoke.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const eq = line.indexOf("=");
  if (eq < 0 || line.trim().startsWith("#")) continue;
  const key = line.slice(0, eq).trim();
  if (!process.env[key]) process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const { deleteInvoiceFiles, readInvoiceFile, storeInvoiceFile } = await import("../lib/invoices/storage");
  const key = await storeInvoiceFile("smoke", "smoke", new TextEncoder().encode("private-ok"), "application/pdf");
  const back = await readInvoiceFile(key);
  console.log("read back:", back ? new TextDecoder().decode(back) : null);
  await deleteInvoiceFiles([key]);
}
main().catch((error) => { console.error("FAILED", error instanceof Error ? error.message : error); process.exit(1); });
```

Run: `cd apps/api && ../../packages/db/node_modules/.bin/tsx scripts/invoice-storage-smoke.ts`
Expected: `read back: private-ok`.

If it fails because the store only takes public files, stop: this is **Needs your decision**. The user has to create a private Blob store in Vercel and set `INVOICE_BLOB_READ_WRITE_TOKEN` for dev and production. That is an account change, so the user does it. Tasks 9–16 can continue with the mocked storage meanwhile. Task 17 needs the real store.

- [ ] **Step 6: Commit**

```bash
git add apps/api/lib/invoices/storage.ts apps/api/lib/invoices/storage.test.ts apps/api/scripts/invoice-storage-smoke.ts
git commit -m "feat(invoices): private file storage for invoice pages"
```

---

### Task 9: Upload routes (create, add page, start reading)

Expo's `FileSystem.uploadAsync` sends one file per request, so a multi-page invoice is uploaded in three steps:

1. `POST /api/invoices` with the first file creates the invoice in `uploading`.
2. `POST /api/invoices/[id]/pages` adds each further photo.
3. `POST /api/invoices/[id]/read` closes the upload and starts the background read.

A PDF is a whole invoice in one file: it can only be the first page, and nothing is added after it.

**Files:**
- Create: `apps/api/lib/invoices/upload.ts`
- Create: `apps/api/app/api/invoices/route.ts` (`POST`; Task 12 adds `GET` to the same file)
- Create: `apps/api/app/api/invoices/[id]/pages/route.ts`
- Create: `apps/api/app/api/invoices/[id]/read/route.ts`
- Test: `apps/api/lib/invoices/upload.test.ts`
- Test: `apps/api/app/api/invoices/__tests__/upload.test.ts`

**Interfaces:**
- Consumes:
  - `requireAuth(req, "manage_products")` and `isNextResponse` (`apps/api/lib/permissions-guard.ts`).
  - `fileMatchesMime`, `PDF_MIME`, `IMAGE_MIMES` (`apps/api/lib/recipe-extraction.ts`).
  - `storeInvoiceFile`, `deleteInvoiceFiles`, `InvoiceStorageError` (Task 8).
  - `readInvoiceSafely(invoiceId: string): Promise<void>` (Task 11). Here it is only passed to `after()`; the tests mock it.
- Produces:
  - `MAX_INVOICE_PAGES = 10`
  - `type UploadedPage = { buffer: Uint8Array; mimeType: string; sizeBytes: number }`
  - `type UploadRejection = { status: 400 | 413 | 415; body: { error: string; code: "file_invalid" } }`
  - `readUploadedPage(form: FormData, opts: { imagesOnly: boolean }): Promise<UploadedPage | UploadRejection>`
  - `POST /api/invoices` returns `201 { id, pages: 1 }`.
  - `POST /api/invoices/[id]/pages` returns `201 { position }`.
  - `POST /api/invoices/[id]/read` returns `202 { id, status: "reading" }`.
  - Error codes: `invoice_not_found` (404), `invoice_not_uploading` (409), `invoice_pdf_single_file` (409), `invoice_too_many_pages` (409), `invoice_page_conflict` (409), `invoice_storage_unavailable` (503).

- [ ] **Step 1: Write the failing test for the upload helper**

```ts
// apps/api/lib/invoices/upload.test.ts
import { describe, expect, it } from "vitest";
import { readUploadedPage } from "./upload";

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];
function form(bytes: number[] | null, type: string, name = "page", size?: number) {
  const f = new FormData();
  if (bytes) {
    const body = size ? new Uint8Array(size).fill(0) : new Uint8Array(bytes);
    if (size) body.set(bytes);
    f.append("file", new File([body], name, { type }));
  }
  return f;
}

describe("readUploadedPage", () => {
  it("accepts a JPEG photo", async () =>
    expect(await readUploadedPage(form(JPEG, "image/jpeg"), { imagesOnly: false })).toMatchObject({ mimeType: "image/jpeg", sizeBytes: 6 }));
  it("infers the type from the name when Android sends none", async () =>
    expect(await readUploadedPage(form(PDF, "", "factura.PDF"), { imagesOnly: false })).toMatchObject({ mimeType: "application/pdf" }));
  it("rejects a missing file", async () =>
    expect(await readUploadedPage(form(null, ""), { imagesOnly: false })).toMatchObject({ status: 400, body: { code: "file_invalid" } }));
  it("rejects a PDF where only photos are allowed", async () =>
    expect(await readUploadedPage(form(PDF, "application/pdf"), { imagesOnly: true })).toMatchObject({ status: 415 }));
  it("rejects bytes that do not match the declared type", async () =>
    expect(await readUploadedPage(form(PDF, "image/jpeg"), { imagesOnly: false })).toMatchObject({ status: 415 }));
  it("rejects a photo over 6 MB", async () =>
    expect(await readUploadedPage(form(JPEG, "image/jpeg", "big.jpg", 6 * 1024 * 1024 + 1), { imagesOnly: false })).toMatchObject({ status: 413 }));
  it("accepts a PDF up to 10 MB", async () =>
    expect(await readUploadedPage(form(PDF, "application/pdf", "f.pdf", 8 * 1024 * 1024), { imagesOnly: false })).toMatchObject({ mimeType: "application/pdf" }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/upload.test.ts`
Expected: FAIL with `Failed to resolve import "./upload"`.

- [ ] **Step 3: Implement the helper**

```ts
// apps/api/lib/invoices/upload.ts
// Validates one uploaded invoice page (multipart field "file"): type, real content and size.
// Same limits as recipe uploads: photos 6 MB, PDFs 10 MB.
import { fileMatchesMime, IMAGE_MIMES, PDF_MIME } from "../recipe-extraction";

export const MAX_INVOICE_PAGES = 10;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type UploadedPage = { buffer: Uint8Array; mimeType: string; sizeBytes: number };
export type UploadRejection = { status: 400 | 413 | 415; body: { error: string; code: "file_invalid" } };

const BY_EXTENSION: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: PDF_MIME };

// Expo on Android can send an empty or generic type: fall back to the file name's extension.
function inferMime(declared: string, fileName: string): string {
  if (declared && declared !== "application/octet-stream") return declared;
  return BY_EXTENSION[fileName.toLowerCase().split(".").pop() ?? ""] ?? declared;
}

const reject = (status: UploadRejection["status"], error: string): UploadRejection => ({ status, body: { error, code: "file_invalid" } });

export async function readUploadedPage(form: FormData, opts: { imagesOnly: boolean }): Promise<UploadedPage | UploadRejection> {
  const file = form.get("file");
  if (!file || !(file instanceof Blob)) return reject(400, "Missing file");
  const mimeType = inferMime(file.type, file instanceof File ? file.name : "");
  const isImage = (IMAGE_MIMES as readonly string[]).includes(mimeType);
  if (!isImage && (opts.imagesOnly || mimeType !== PDF_MIME)) return reject(415, "Unsupported file type");
  if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_PDF_BYTES)) return reject(413, "File too large");
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!fileMatchesMime(buffer, mimeType)) return reject(415, "File does not match its type");
  return { buffer, mimeType, sizeBytes: file.size };
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/upload.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests**

```ts
// apps/api/app/api/invoices/__tests__/upload.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard, storage, reader, after } = vi.hoisted(() => ({
  db: {
    invoice: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    invoicePage: { create: vi.fn() },
  },
  guard: { requireAuth: vi.fn() },
  storage: { storeInvoiceFile: vi.fn(), deleteInvoiceFiles: vi.fn() },
  reader: { readInvoiceSafely: vi.fn() },
  after: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/invoices/storage", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/invoices/storage")>()), ...storage }));
vi.mock("@/lib/invoices/read-invoice", () => reader);
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after }));

import { InvoiceStorageError } from "@/lib/invoices/storage";
import { POST as create } from "../route";
import { POST as addPage } from "../[id]/pages/route";
import { POST as startRead } from "../[id]/read/route";

const CTX = { userId: "u1", role: "chef_executive", restaurantId: "r1" };
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];
const params = (id = "inv1") => ({ params: Promise.resolve({ id }) });
function multipart(url: string, bytes: number[], type: string) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], "page", { type }));
  return new NextRequest(url, { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue(CTX);
  db.invoice.create.mockResolvedValue({ id: "inv1" });
  storage.storeInvoiceFile.mockResolvedValue("invoices/r1/inv1/a.jpg");
});

describe("POST /api/invoices", () => {
  it("needs manage_products", async () => {
    guard.requireAuth.mockResolvedValue(Response.json({}, { status: 403 }));
    expect((await create(multipart("https://t.local/api/invoices", JPEG, "image/jpeg"))).status).toBe(403);
    expect(guard.requireAuth).toHaveBeenCalledWith(expect.anything(), "manage_products");
  });

  it("creates an uploading invoice with its first page", async () => {
    const res = await create(multipart("https://t.local/api/invoices", JPEG, "image/jpeg"));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "inv1", pages: 1 });
    expect(db.invoice.create).toHaveBeenCalledWith({ data: { restaurantId: "r1", uploadedById: "u1", status: "uploading" }, select: { id: true } });
    expect(storage.storeInvoiceFile).toHaveBeenCalledWith("r1", "inv1", expect.any(Uint8Array), "image/jpeg");
    expect(db.invoicePage.create).toHaveBeenCalledWith({ data: { invoiceId: "inv1", position: 0, storageKey: "invoices/r1/inv1/a.jpg", mimeType: "image/jpeg", sizeBytes: 6 } });
  });

  it("a storage outage leaves no invoice behind", async () => {
    storage.storeInvoiceFile.mockRejectedValue(new InvoiceStorageError("invoice_storage_unavailable"));
    const res = await create(multipart("https://t.local/api/invoices", JPEG, "image/jpeg"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "invoice_storage_unavailable" });
    expect(db.invoice.delete).toHaveBeenCalledWith({ where: { id: "inv1" } });
  });

  it("rejects a bad file before creating anything", async () => {
    const res = await create(multipart("https://t.local/api/invoices", PDF, "image/jpeg"));
    expect(res.status).toBe(415);
    expect(db.invoice.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/invoices/[id]/pages", () => {
  const uploading = (pages: Array<{ mimeType: string }>) =>
    db.invoice.findFirst.mockResolvedValue({ id: "inv1", status: "uploading", pages });

  it("adds the next photo at the next position", async () => {
    uploading([{ mimeType: "image/jpeg" }]);
    const res = await addPage(multipart("https://t.local/api/invoices/inv1/pages", JPEG, "image/jpeg"), params());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ position: 1 });
    expect(db.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv1", restaurantId: "r1", deletedAt: null } }));
  });

  it("another restaurant's invoice is not found", async () => {
    db.invoice.findFirst.mockResolvedValue(null);
    expect((await addPage(multipart("https://t.local/x", JPEG, "image/jpeg"), params())).status).toBe(404);
  });

  it("refuses pages once reading started", async () => {
    db.invoice.findFirst.mockResolvedValue({ id: "inv1", status: "reading", pages: [{ mimeType: "image/jpeg" }] });
    expect(await (await addPage(multipart("https://t.local/x", JPEG, "image/jpeg"), params())).json()).toMatchObject({ code: "invoice_not_uploading" });
  });

  it("nothing is added after a PDF", async () => {
    uploading([{ mimeType: "application/pdf" }]);
    expect(await (await addPage(multipart("https://t.local/x", JPEG, "image/jpeg"), params())).json()).toMatchObject({ code: "invoice_pdf_single_file" });
  });

  it("stops at 10 pages", async () => {
    uploading(Array.from({ length: 10 }, () => ({ mimeType: "image/jpeg" })));
    expect(await (await addPage(multipart("https://t.local/x", JPEG, "image/jpeg"), params())).json()).toMatchObject({ code: "invoice_too_many_pages" });
  });

  it("two pages racing for one position: the loser gets 409 and its file is removed", async () => {
    uploading([{ mimeType: "image/jpeg" }]);
    db.invoicePage.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await addPage(multipart("https://t.local/x", JPEG, "image/jpeg"), params());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "invoice_page_conflict" });
    expect(storage.deleteInvoiceFiles).toHaveBeenCalledWith(["invoices/r1/inv1/a.jpg"]);
  });
});

describe("POST /api/invoices/[id]/read", () => {
  it("claims the upload and reads it in the background", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
    const res = await startRead(new NextRequest("https://t.local/x", { method: "POST" }), params());
    expect(res.status).toBe(202);
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", restaurantId: "r1", deletedAt: null, status: "uploading" },
      data: { status: "reading", failureReason: null },
    });
    expect(after).toHaveBeenCalledTimes(1);
    await after.mock.calls[0]![0]();
    expect(reader.readInvoiceSafely).toHaveBeenCalledWith("inv1");
  });

  it("a second tap does not start a second read", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 0 });
    db.invoice.findFirst.mockResolvedValue({ status: "reading" });
    const res = await startRead(new NextRequest("https://t.local/x", { method: "POST" }), params());
    expect(res.status).toBe(409);
    expect(after).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the route tests to verify they fail**

Run: `cd apps/api && pnpm exec vitest run app/api/invoices/__tests__/upload.test.ts`
Expected: FAIL with `Failed to resolve import "../route"`.

- [ ] **Step 7: Implement the three routes**

```ts
// apps/api/app/api/invoices/route.ts
// POST: first page of a new invoice (multipart field "file"). The invoice stays in
// "uploading" until POST /api/invoices/[id]/read. GET (list) is added in Task 12.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { readUploadedPage } from "@/lib/invoices/upload";
import { InvoiceStorageError, storeInvoiceFile } from "@/lib/invoices/storage";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const page = await readUploadedPage(await req.formData(), { imagesOnly: false });
  if ("status" in page) return NextResponse.json(page.body, { status: page.status });

  const invoice = await prisma.invoice.create({
    data: { restaurantId: ctx.restaurantId, uploadedById: ctx.userId, status: "uploading" },
    select: { id: true },
  });
  try {
    const storageKey = await storeInvoiceFile(ctx.restaurantId, invoice.id, page.buffer, page.mimeType);
    await prisma.invoicePage.create({
      data: { invoiceId: invoice.id, position: 0, storageKey, mimeType: page.mimeType, sizeBytes: page.sizeBytes },
    });
  } catch (error) {
    await prisma.invoice.delete({ where: { id: invoice.id } }).catch(() => undefined);
    if (error instanceof InvoiceStorageError) {
      return NextResponse.json({ error: "Invoice storage unavailable", code: "invoice_storage_unavailable" }, { status: 503 });
    }
    throw error;
  }
  logger.info("invoice_upload_started", { invoiceId: invoice.id, mimeType: page.mimeType, bytes: page.sizeBytes });
  return NextResponse.json({ id: invoice.id, pages: 1 }, { status: 201 });
}
```

```ts
// apps/api/app/api/invoices/[id]/pages/route.ts
// Adds one more photo to an invoice that is still uploading. A PDF is a whole invoice:
// it can only be the first file.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { MAX_INVOICE_PAGES, readUploadedPage } from "@/lib/invoices/upload";
import { deleteInvoiceFiles, InvoiceStorageError, storeInvoiceFile } from "@/lib/invoices/storage";

export const dynamic = "force-dynamic";

const conflict = (code: string, error: string) => NextResponse.json({ error, code }, { status: 409 });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, restaurantId: ctx.restaurantId, deletedAt: null },
    select: { id: true, status: true, pages: { select: { mimeType: true }, orderBy: { position: "asc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found", code: "invoice_not_found" }, { status: 404 });
  if (invoice.status !== "uploading") return conflict("invoice_not_uploading", "The invoice is no longer uploading");
  if (invoice.pages[0]?.mimeType === "application/pdf") return conflict("invoice_pdf_single_file", "A PDF invoice has a single file");
  if (invoice.pages.length >= MAX_INVOICE_PAGES) return conflict("invoice_too_many_pages", "Too many pages");

  const page = await readUploadedPage(await req.formData(), { imagesOnly: true });
  if ("status" in page) return NextResponse.json(page.body, { status: page.status });

  let storageKey: string;
  try {
    storageKey = await storeInvoiceFile(ctx.restaurantId, id, page.buffer, page.mimeType);
  } catch (error) {
    if (error instanceof InvoiceStorageError) {
      return NextResponse.json({ error: "Invoice storage unavailable", code: "invoice_storage_unavailable" }, { status: 503 });
    }
    throw error;
  }
  const position = invoice.pages.length;
  try {
    await prisma.invoicePage.create({ data: { invoiceId: id, position, storageKey, mimeType: page.mimeType, sizeBytes: page.sizeBytes } });
  } catch (error) {
    await deleteInvoiceFiles([storageKey]);
    if ((error as { code?: unknown }).code === "P2002") return conflict("invoice_page_conflict", "Another page took this position");
    throw error;
  }
  return NextResponse.json({ position }, { status: 201 });
}
```

```ts
// apps/api/app/api/invoices/[id]/read/route.ts
// Closes the upload and reads the invoice in the background. The status claim
// (uploading -> reading) makes a double tap start one read only.
import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { readInvoiceSafely } from "@/lib/invoices/read-invoice";

export const dynamic = "force-dynamic";
// The after() read counts toward this limit; readInvoice stops itself at READ_DEADLINE_MS (Task 11).
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const claimed = await prisma.invoice.updateMany({
    where: { id, restaurantId: ctx.restaurantId, deletedAt: null, status: "uploading" },
    data: { status: "reading", failureReason: null },
  });
  if (claimed.count === 0) {
    const existing = await prisma.invoice.findFirst({ where: { id, restaurantId: ctx.restaurantId, deletedAt: null }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: "Not found", code: "invoice_not_found" }, { status: 404 });
    return NextResponse.json({ error: "The invoice is no longer uploading", code: "invoice_not_uploading" }, { status: 409 });
  }
  after(() => readInvoiceSafely(id));
  return NextResponse.json({ id, status: "reading" }, { status: 202 });
}
```

Until Task 11 exists, the import of `@/lib/invoices/read-invoice` only resolves in the tests, which mock it. So create a one-line placeholder module now, which Task 11 replaces:

```ts
// apps/api/lib/invoices/read-invoice.ts (replaced in Task 11)
export async function readInvoiceSafely(_invoiceId: string): Promise<void> {}
```

- [ ] **Step 8: Run the tests and typecheck**

Run: `cd apps/api && pnpm exec vitest run app/api/invoices lib/invoices/upload.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/lib/invoices/upload.ts apps/api/lib/invoices/upload.test.ts apps/api/lib/invoices/read-invoice.ts apps/api/app/api/invoices
git commit -m "feat(invoices): upload invoice pages one request at a time and start the read"
```

---

### Task 10: Proposals for each read line

This task takes the read lines of one invoice and decides, for each one:
- the product,
- the match level,
- the price in the product's unit,
- the proposed action.

Lines the chef must decide (ambiguo, probable, a change of 20% or more) get `action: null`, so apply refuses them until they are decided (Task 14).

**Files:**
- Create: `apps/api/lib/invoices/propose.ts`
- Test: `apps/api/lib/invoices/propose.test.ts`

**Interfaces:**
- Consumes:
  - `loadMatchCandidates(restaurantId)` (`apps/api/lib/recipes/extraction-pipeline.ts:38`).
  - `matchInvoiceLines`, `SecondLook`, `LineMatchLevel` (Task 5).
  - `priceInBankUnit`, `proposeLine`, `draftUnitFor` (Task 3).
  - `ExtractedInvoiceLine` (Task 2).
- Produces:
  - `type ProposedLine = ExtractedInvoiceLine & { position: number; productId: string | null; matchLevel: LineMatchLevel; action: "update_price" | "create_draft" | "connect" | "ignore" | null; appliedPriceCents: number | null }`. `packQty` and `packUnit` are the effective pack: the line's own, or the one remembered for this supplier.
  - `proposeInvoiceLines(input: { restaurantId: string; supplierId: string | null; invoiceDate: string; lines: ReadonlyArray<ExtractedInvoiceLine>; secondLook: SecondLook }): Promise<ProposedLine[]>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/lib/invoices/propose.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, pipeline } = vi.hoisted(() => ({
  db: { supplierItem: { findMany: vi.fn() }, product: { findMany: vi.fn() } },
  pipeline: { loadMatchCandidates: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("../recipes/extraction-pipeline", () => pipeline);
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
import { proposeInvoiceLines } from "./propose";
import type { ExtractedInvoiceLine } from "./extraction";

const line = (over: Partial<ExtractedInvoiceLine>): ExtractedInvoiceLine => ({
  description: "Calamari puliti", code: null, quantity: 2, unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 1100, taxRatePct: 10, lineTotalCents: 2200, kind: "item", ...over,
});
const noLook = async () => new Map<number, string | null>();
const at = new Date("2026-10-01T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.supplierItem.findMany.mockResolvedValue([]);
  pipeline.loadMatchCandidates.mockResolvedValue([
    { id: "calamari", name: "Calamari puliti", aliases: [] },
    { id: "g1", name: "Gambero rosso Mazara", aliases: [] },
    { id: "g2", name: "Gambero rosso Sicilia", aliases: [] },
  ]);
  db.product.findMany.mockResolvedValue([
    { id: "calamari", precioCompra: 1000, unidadCompra: "kg", precioActualizadoAt: at },
  ]);
});

const propose = (lines: ExtractedInvoiceLine[], supplierId: string | null = null) =>
  proposeInvoiceLines({ restaurantId: "r1", supplierId, invoiceDate: "2026-10-10", lines, secondLook: noLook });

describe("proposeInvoiceLines", () => {
  it("a small price change on an exact match is pre-selected", async () => {
    const [p] = await propose([line({})]);
    expect(p).toMatchObject({ position: 0, productId: "calamari", matchLevel: "exact", action: "update_price", appliedPriceCents: 1100 });
  });

  it("a change of 20% or more waits for the chef", async () => {
    const [p] = await propose([line({ unitPriceCents: 1300, lineTotalCents: 2600 })]);
    expect(p).toMatchObject({ action: null, appliedPriceCents: 1300 });
  });

  it("an ambiguous family waits for the chef", async () => {
    const [p] = await propose([line({ description: "Gambero rosso" })]);
    expect(p).toMatchObject({ productId: null, matchLevel: "ambiguo", action: null });
  });

  it("an unknown product becomes a draft priced in its own unit", async () => {
    const [p] = await propose([line({ description: "Fasolari", unit: "kg", unitPriceCents: 2500, lineTotalCents: 5000 })]);
    expect(p).toMatchObject({ productId: null, matchLevel: "none", action: "create_draft", appliedPriceCents: 2500 });
  });

  it("a deposit charge is ignored and never priced", async () => {
    const [p] = await propose([line({ description: "DIFFERENZA CAUZIONALE", kind: "charge", unit: null })]);
    expect(p).toMatchObject({ matchLevel: "charge", action: "ignore", appliedPriceCents: null });
  });

  it("supplier memory is loaded only for this supplier's live products in this restaurant", async () => {
    await propose([line({})], "s1");
    expect(db.supplierItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { supplierId: "s1", product: { restaurantId: "r1", deletedAt: null } },
    }));
    await propose([line({})], null);
    expect(db.supplierItem.findMany).toHaveBeenCalledTimes(1);
  });

  it("a remembered pack prices a box line per kilo", async () => {
    db.supplierItem.findMany.mockResolvedValue([
      { code: null, descriptionNorm: "cozza arborea", productId: "calamari", packQty: { toNumber: () => 5 }, packUnit: "kg" },
    ]);
    const [p] = await propose([line({ description: "COZZA (ARBOREA)", quantity: 1, unit: "CF", unitPriceCents: 5000, lineTotalCents: 5000 })], "s1");
    expect(p).toMatchObject({ productId: "calamari", matchLevel: "memory", packQty: 5, packUnit: "kg", appliedPriceCents: 1000 });
  });
});
```

The "remembered pack" case expects the same price as the current one (5000 per 5 kg box = 1000 per kg). `proposeLine` turns that into `connect` with `same_price`, so only `appliedPriceCents` is asserted, not the action.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/propose.test.ts`
Expected: FAIL with `Failed to resolve import "./propose"`.

- [ ] **Step 3: Implement**

```ts
// apps/api/lib/invoices/propose.ts
// Turns the read lines of one invoice into review proposals: product, match level, price
// in the product's unit and the pre-selected action. action null = the chef decides.
import { prisma } from "@atelier/db";
import { loadMatchCandidates } from "../recipes/extraction-pipeline";
import type { ExtractedInvoiceLine } from "./extraction";
import { matchInvoiceLines, type LineMatchLevel, type SecondLook } from "./line-matching";
import { draftUnitFor, priceInBankUnit, proposeLine } from "./pricing";

export type ProposedLine = ExtractedInvoiceLine & {
  position: number;
  productId: string | null;
  matchLevel: LineMatchLevel;
  action: "update_price" | "create_draft" | "connect" | "ignore" | null;
  appliedPriceCents: number | null;
};

const toNumber = (v: { toNumber(): number } | number | null) => (v === null ? null : typeof v === "number" ? v : v.toNumber());

export async function proposeInvoiceLines(input: {
  restaurantId: string;
  supplierId: string | null;
  invoiceDate: string;
  lines: ReadonlyArray<ExtractedInvoiceLine>;
  secondLook: SecondLook;
}): Promise<ProposedLine[]> {
  const [memoryRows, candidates] = await Promise.all([
    input.supplierId
      ? prisma.supplierItem.findMany({
          where: { supplierId: input.supplierId, product: { restaurantId: input.restaurantId, deletedAt: null } },
          select: { code: true, descriptionNorm: true, productId: true, packQty: true, packUnit: true },
        })
      : Promise.resolve([]),
    loadMatchCandidates(input.restaurantId),
  ]);
  const memory = memoryRows.map((m) => ({ ...m, packQty: toNumber(m.packQty) }));
  const matches = await matchInvoiceLines({ lines: input.lines, memory, candidates, secondLook: input.secondLook });

  const ids = [...new Set(matches.flatMap((m) => (m.productId ? [m.productId] : [])))];
  const products = new Map(
    (ids.length === 0 ? [] : await prisma.product.findMany({
      where: { id: { in: ids }, restaurantId: input.restaurantId, deletedAt: null },
      select: { id: true, precioCompra: true, unidadCompra: true, precioActualizadoAt: true },
    })).map((p) => [p.id, p] as const),
  );

  return input.lines.map((line, position) => {
    const match = matches[position]!;
    const effective = { ...line, packQty: match.packQty, packUnit: match.packUnit };
    const product = match.productId ? products.get(match.productId) : undefined;
    const bankUnit = product?.unidadCompra ?? draftUnitFor(effective);
    const price = line.kind === "charge" || !bankUnit ? null : priceInBankUnit(effective, bankUnit);
    const proposal = proposeLine({
      productId: product?.id ?? null,
      currentPriceCents: product?.precioCompra ?? 0,
      currentPriceAt: product?.precioActualizadoAt ?? null,
      newPriceCents: price,
      invoiceDate: input.invoiceDate,
      kind: line.kind,
    });
    const undecided =
      match.level === "ambiguo" || match.level === "probable" || (proposal.action === "update_price" && !proposal.preselected);
    return {
      ...effective,
      position,
      productId: product?.id ?? null,
      matchLevel: match.level,
      action: undecided ? null : proposal.action,
      appliedPriceCents: line.kind === "charge" ? null : price,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/propose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/invoices/propose.ts apps/api/lib/invoices/propose.test.ts
git commit -m "feat(invoices): propose product, price and action for each read line"
```

---

### Task 11: The background read

`readInvoice` runs inside `after()`. For each page, in order, it:
1. reserves one AI call from the uploader's quota;
2. reads the private file;
3. extracts the page.

Then it:
- merges the pages (Task 4);
- upserts the supplier;
- proposes the lines (Task 10), with at most one more AI call for the second look;
- saves everything.

Every exit leaves the invoice in `review` or in `failed` with a reason. The final write is fenced on `status = reading`. So a read that was retried or timed out meanwhile never overwrites the newer state.

Failure reasons, which Plan 3 translates for the chef:

| Reason | When |
|---|---|
| `ai_quota` | The uploader's daily AI quota is spent. |
| `ai_unavailable` | The provider failed, or the generation budget is spent. |
| `unreadable` | The model's answer for a page was invalid or incomplete. |
| `file_missing` | A page file is gone from storage. |
| `storage_unavailable` | The storage could not be read. |
| `not_an_invoice` | No page looks like an invoice or delivery note. |
| `no_lines` | The pages were read, but no line was found. |
| `read_timeout` | The read hit its own deadline, or was stuck (Task 12). |
| `internal_error` | Anything else. Logged with the invoice id. |

**Files:**
- Modify: `apps/api/lib/invoices/read-invoice.ts` (replaces the Task 9 placeholder)
- Test: `apps/api/lib/invoices/read-invoice.test.ts`

**Interfaces:**
- Consumes:
  - `extractInvoicePage` and `InvoiceExtractionError` (`extraction.ts`).
  - `mergeInvoicePages` (Task 4); `normalizeSupplierName` (Task 5); `secondLook` (Task 6).
  - `readInvoiceFile` and `InvoiceStorageError` (Task 8); `proposeInvoiceLines` (Task 10).
  - `reserveAiCall` and `recordAiTokens` (`apps/api/lib/ai-quota.ts`); `AiBudgetError` (`apps/api/lib/ai/budget-policy.ts`).
- Produces:
  - `READ_DEADLINE_MS = 270_000`
  - `type InvoiceFailureReason = "ai_quota" | "ai_unavailable" | "unreadable" | "file_missing" | "storage_unavailable" | "not_an_invoice" | "no_lines" | "read_timeout" | "internal_error"`
  - `readInvoice(invoiceId: string, deadline: number): Promise<void>`
  - `readInvoiceSafely(invoiceId: string): Promise<void>`, which never throws.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/lib/invoices/read-invoice.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, tx, quota, storage, extraction, look, propose } = vi.hoisted(() => {
  const tx = { invoice: { updateMany: vi.fn() }, invoiceLine: { deleteMany: vi.fn(), createMany: vi.fn() } };
  return {
    tx,
    db: {
      invoice: { findFirst: vi.fn(), updateMany: vi.fn() },
      supplier: { upsert: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    quota: { reserveAiCall: vi.fn(), recordAiTokens: vi.fn() },
    storage: { readInvoiceFile: vi.fn() },
    extraction: { extractInvoicePage: vi.fn() },
    look: { secondLook: vi.fn() },
    propose: { proposeInvoiceLines: vi.fn() },
  };
});
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("../ai-quota", () => quota);
vi.mock("./storage", async (importOriginal) => ({ ...(await importOriginal<typeof import("./storage")>()), ...storage }));
vi.mock("./extraction", async (importOriginal) => ({ ...(await importOriginal<typeof import("./extraction")>()), ...extraction }));
vi.mock("./second-look", () => look);
vi.mock("./propose", () => propose);
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { InvoiceExtractionError } from "./extraction";
import { InvoiceStorageError } from "./storage";
import { readInvoice, readInvoiceSafely } from "./read-invoice";

const page = (over: Record<string, unknown> = {}) => ({
  isInvoice: true, supplierName: "GARDEN FRUIT s.r.l.", supplierTaxId: "IT01", invoiceNumber: "77", invoiceDate: "2026-10-10",
  netTotalCents: 2200, taxTotalCents: 88, grossTotalCents: 2288, droppedLines: 0,
  lines: [{ description: "Zucchine", code: null, quantity: 2, unit: "kg", packQty: null, packUnit: null, unitPriceCents: 1100, taxRatePct: 4, lineTotalCents: 2200, kind: "item" }],
  ...over,
});
const later = () => Date.now() + 60_000;

beforeEach(() => {
  vi.clearAllMocks();
  db.invoice.findFirst.mockResolvedValue({
    id: "inv1", restaurantId: "r1", uploadedById: "u1", createdAt: new Date("2026-10-11T08:00:00Z"),
    pages: [{ position: 0, storageKey: "k0", mimeType: "image/jpeg" }],
  });
  db.invoice.updateMany.mockResolvedValue({ count: 1 });
  db.supplier.upsert.mockResolvedValue({ id: "s1" });
  quota.reserveAiCall.mockResolvedValue({ ok: true });
  storage.readInvoiceFile.mockResolvedValue(new Uint8Array([1]));
  extraction.extractInvoicePage.mockResolvedValue(page());
  propose.proposeInvoiceLines.mockResolvedValue([{ ...page().lines[0], position: 0, productId: null, matchLevel: "none", action: "create_draft", appliedPriceCents: 1100 }]);
  tx.invoice.updateMany.mockResolvedValue({ count: 1 });
});

const failedWith = (reason: string) =>
  expect(db.invoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv1", status: "reading" }, data: { status: "failed", failureReason: reason } });

describe("readInvoice", () => {
  it("only reads an invoice that is still reading", async () => {
    await readInvoice("inv1", later());
    expect(db.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv1", status: "reading", deletedAt: null } }));
  });

  it("reads, upserts the supplier by normalized name and saves the review", async () => {
    await readInvoice("inv1", later());
    expect(db.supplier.upsert).toHaveBeenCalledWith({
      where: { restaurantId_nameNorm: { restaurantId: "r1", nameNorm: "garden fruit" } },
      create: { restaurantId: "r1", name: "GARDEN FRUIT s.r.l.", nameNorm: "garden fruit", taxId: "IT01" },
      update: { taxId: "IT01" },
      select: { id: true },
    });
    expect(propose.proposeInvoiceLines).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: "r1", supplierId: "s1", invoiceDate: "2026-10-10" }));
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", status: "reading" },
      data: expect.objectContaining({ status: "review", supplierId: "s1", number: "77", issuedOn: new Date("2026-10-10T00:00:00Z"), netTotalCents: 2200, grossTotalCents: 2288 }),
    });
    expect(tx.invoiceLine.deleteMany).toHaveBeenCalledWith({ where: { invoiceId: "inv1" } });
    expect(tx.invoiceLine.createMany.mock.calls[0]![0].data[0]).toMatchObject({ invoiceId: "inv1", position: 0, description: "Zucchine", matchLevel: "none", action: "create_draft", appliedPriceCents: 1100 });
  });

  it("each page reserves one AI call from the uploader", async () => {
    db.invoice.findFirst.mockResolvedValue({ id: "inv1", restaurantId: "r1", uploadedById: "u1", createdAt: new Date(), pages: [
      { position: 0, storageKey: "k0", mimeType: "image/jpeg" }, { position: 1, storageKey: "k1", mimeType: "image/jpeg" },
    ] });
    await readInvoice("inv1", later());
    expect(quota.reserveAiCall).toHaveBeenCalledTimes(2);
    expect(storage.readInvoiceFile.mock.calls.map((c) => c[0])).toEqual(["k0", "k1"]);
  });

  it.each([
    ["the quota is spent", () => quota.reserveAiCall.mockResolvedValue({ ok: false, retryAfter: 60 }), "ai_quota"],
    ["the file is gone", () => storage.readInvoiceFile.mockResolvedValue(null), "file_missing"],
    ["storage is down", () => storage.readInvoiceFile.mockRejectedValue(new InvoiceStorageError("invoice_storage_unavailable")), "storage_unavailable"],
    ["the answer is invalid", () => extraction.extractInvoicePage.mockRejectedValue(new InvoiceExtractionError("invoice_response_invalid")), "unreadable"],
    ["the answer is cut", () => extraction.extractInvoicePage.mockRejectedValue(new Error("invoice_extraction_incomplete")), "unreadable"],
    ["the provider fails", () => extraction.extractInvoicePage.mockRejectedValue(new Error("ai_provider_http_503")), "ai_unavailable"],
    ["it is not an invoice", () => extraction.extractInvoicePage.mockResolvedValue(page({ isInvoice: false })), "not_an_invoice"],
    ["no line was found", () => extraction.extractInvoicePage.mockResolvedValue(page({ lines: [] })), "no_lines"],
  ])("fails with a reason when %s", async (_name, arrange, reason) => {
    arrange();
    await readInvoice("inv1", later());
    failedWith(reason);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("stops at its deadline", async () => {
    await readInvoice("inv1", Date.now() - 1);
    failedWith("read_timeout");
    expect(extraction.extractInvoicePage).not.toHaveBeenCalled();
  });

  it("an unreadable supplier name leaves the supplier empty", async () => {
    extraction.extractInvoicePage.mockResolvedValue(page({ supplierName: "  S.r.l. " }));
    await readInvoice("inv1", later());
    expect(db.supplier.upsert).not.toHaveBeenCalled();
    expect(propose.proposeInvoiceLines).toHaveBeenCalledWith(expect.objectContaining({ supplierId: null }));
  });

  it("two reads creating one supplier: the loser reuses the winner's row", async () => {
    db.supplier.upsert.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    db.supplier.findUnique.mockResolvedValue({ id: "s9" });
    await readInvoice("inv1", later());
    expect(propose.proposeInvoiceLines).toHaveBeenCalledWith(expect.objectContaining({ supplierId: "s9" }));
  });

  it("without a printed date the upload day is used for the price rules", async () => {
    extraction.extractInvoicePage.mockResolvedValue(page({ invoiceDate: null }));
    await readInvoice("inv1", later());
    expect(propose.proposeInvoiceLines).toHaveBeenCalledWith(expect.objectContaining({ invoiceDate: "2026-10-11" }));
  });

  it("the second look is skipped when the quota has no call left", async () => {
    quota.reserveAiCall.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, retryAfter: 60 });
    await readInvoice("inv1", later());
    const { secondLook } = propose.proposeInvoiceLines.mock.calls[0]![0];
    expect(await secondLook([{ position: 0, description: "x", candidates: [] }])).toEqual(new Map());
    expect(look.secondLook).not.toHaveBeenCalled();
  });

  it("a read that lost the race does not overwrite the lines", async () => {
    tx.invoice.updateMany.mockResolvedValue({ count: 0 });
    await readInvoice("inv1", later());
    expect(tx.invoiceLine.deleteMany).not.toHaveBeenCalled();
  });
});

describe("readInvoiceSafely", () => {
  it("never throws and marks the invoice failed", async () => {
    db.invoice.findFirst.mockRejectedValue(new Error("db down"));
    await expect(readInvoiceSafely("inv1")).resolves.toBeUndefined();
    failedWith("internal_error");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/read-invoice.test.ts`
Expected: FAIL, because the placeholder `readInvoice` is not exported.

- [ ] **Step 3: Implement**

```ts
// apps/api/lib/invoices/read-invoice.ts
// The background read of one uploaded invoice (runs in after()). Every exit leaves the
// invoice in "review" or in "failed" with a reason; writes are fenced on status "reading"
// so a retried or timed-out read never overwrites a newer state.
import { prisma } from "@atelier/db";
import { recordAiTokens, reserveAiCall } from "../ai-quota";
import { AiBudgetError } from "../ai/budget-policy";
import { logger } from "../logger";
import { extractInvoicePage, InvoiceExtractionError, type ExtractedInvoicePage } from "./extraction";
import { normalizeSupplierName, type SecondLook } from "./line-matching";
import { proposeInvoiceLines } from "./propose";
import { secondLook } from "./second-look";
import { InvoiceStorageError, readInvoiceFile } from "./storage";
import { mergeInvoicePages } from "./totals";

export const READ_DEADLINE_MS = 270_000;

export type InvoiceFailureReason =
  | "ai_quota" | "ai_unavailable" | "unreadable" | "file_missing" | "storage_unavailable"
  | "not_an_invoice" | "no_lines" | "read_timeout" | "internal_error";

class ReadFailure extends Error {
  constructor(readonly reason: InvoiceFailureReason) { super(reason); }
}

function reasonFor(error: unknown): InvoiceFailureReason {
  if (error instanceof ReadFailure) return error.reason;
  if (error instanceof InvoiceStorageError) return "storage_unavailable";
  if (error instanceof InvoiceExtractionError) return "unreadable";
  if (error instanceof AiBudgetError) return "ai_unavailable";
  const message = error instanceof Error ? error.message : "";
  if (message === "invoice_extraction_incomplete") return "unreadable";
  if (message.startsWith("ai_")) return "ai_unavailable";
  return "internal_error";
}

async function markFailed(invoiceId: string, reason: InvoiceFailureReason) {
  await prisma.invoice.updateMany({ where: { id: invoiceId, status: "reading" }, data: { status: "failed", failureReason: reason } });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function upsertSupplier(restaurantId: string, name: string | null, taxId: string | null): Promise<string | null> {
  const nameNorm = normalizeSupplierName(name ?? "");
  if (!name || nameNorm === "") return null;
  try {
    const supplier = await prisma.supplier.upsert({
      where: { restaurantId_nameNorm: { restaurantId, nameNorm } },
      create: { restaurantId, name: name.trim(), nameNorm, taxId },
      update: taxId ? { taxId } : {},
      select: { id: true },
    });
    return supplier.id;
  } catch (error) {
    // Two reads of the same new supplier race on the unique key: the loser reuses the winner's row.
    if ((error as { code?: unknown }).code !== "P2002") throw error;
    const existing = await prisma.supplier.findUnique({ where: { restaurantId_nameNorm: { restaurantId, nameNorm } }, select: { id: true } });
    return existing?.id ?? null;
  }
}

export async function readInvoice(invoiceId: string, deadline: number): Promise<void> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, status: "reading", deletedAt: null },
    select: { id: true, restaurantId: true, uploadedById: true, createdAt: true, pages: { orderBy: { position: "asc" }, select: { position: true, storageKey: true, mimeType: true } } },
  });
  if (!invoice) return;
  const userId = invoice.uploadedById;
  const onUsage = userId
    ? (usage: { inputTokens: number; outputTokens: number }) => { recordAiTokens(userId, usage.inputTokens, usage.outputTokens).catch(() => undefined); }
    : undefined;

  try {
    const pages: ExtractedInvoicePage[] = [];
    for (const page of invoice.pages) {
      if (Date.now() >= deadline) throw new ReadFailure("read_timeout");
      if (userId && !(await reserveAiCall(userId)).ok) throw new ReadFailure("ai_quota");
      const bytes = await readInvoiceFile(page.storageKey);
      if (!bytes) throw new ReadFailure("file_missing");
      pages.push(await extractInvoicePage(bytes, page.mimeType, onUsage));
    }
    const merged = mergeInvoicePages(pages);
    if (merged.invoicePages === 0) throw new ReadFailure("not_an_invoice");
    if (merged.lines.length === 0) throw new ReadFailure("no_lines");

    const { header } = merged;
    const supplierId = await upsertSupplier(invoice.restaurantId, header.supplierName, header.supplierTaxId);
    const issuedOn = header.invoiceDate && DATE.test(header.invoiceDate) ? header.invoiceDate : null;
    // The second look is one more AI call: without quota left the chef simply reviews more lines.
    const look: SecondLook = async (requests) =>
      userId && !(await reserveAiCall(userId)).ok ? new Map() : secondLook(requests, onUsage);
    const proposed = await proposeInvoiceLines({
      restaurantId: invoice.restaurantId,
      supplierId,
      invoiceDate: issuedOn ?? invoice.createdAt.toISOString().slice(0, 10),
      lines: merged.lines,
      secondLook: look,
    });

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: { id: invoiceId, status: "reading" },
        data: {
          status: "review", failureReason: null, supplierId, number: header.invoiceNumber,
          issuedOn: issuedOn ? new Date(`${issuedOn}T00:00:00Z`) : null,
          netTotalCents: header.netTotalCents, taxTotalCents: header.taxTotalCents, grossTotalCents: header.grossTotalCents,
        },
      });
      if (claimed.count === 0) return;
      await tx.invoiceLine.deleteMany({ where: { invoiceId } });
      await tx.invoiceLine.createMany({
        data: proposed.map((l) => ({
          invoiceId, position: l.position, description: l.description, code: l.code, quantity: l.quantity, unit: l.unit,
          packQty: l.packQty, packUnit: l.packUnit, unitPriceCents: l.unitPriceCents, taxRatePct: l.taxRatePct,
          lineTotalCents: l.lineTotalCents, productId: l.productId, matchLevel: l.matchLevel, action: l.action,
          appliedPriceCents: l.appliedPriceCents,
        })),
      });
    });
    logger.info("invoice_read", { invoiceId, pages: pages.length, lines: proposed.length, droppedLines: merged.droppedLines });
  } catch (error) {
    const reason = reasonFor(error);
    if (reason === "internal_error") throw error;
    logger.warn("invoice_read_failed", { invoiceId, reason, message: error instanceof Error ? error.message : String(error) });
    await markFailed(invoiceId, reason);
  }
}

export async function readInvoiceSafely(invoiceId: string): Promise<void> {
  try {
    await readInvoice(invoiceId, Date.now() + READ_DEADLINE_MS);
  } catch (error) {
    logger.error("invoice_read_crashed", { invoiceId, message: error instanceof Error ? error.message : String(error) });
    await markFailed(invoiceId, "internal_error").catch(() => undefined);
  }
}
```

The `kind` field is not stored: a charge line is saved with `matchLevel: "charge"`, which is enough to tell it apart.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/read-invoice.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/invoices/read-invoice.ts apps/api/lib/invoices/read-invoice.test.ts
git commit -m "feat(invoices): background read with quota, supplier upsert and fenced save"
```

---

### Task 12: Read routes and shared contracts

These routes:
- list the invoices grouped by supplier (S3, newest first);
- show one invoice with its checks;
- stream a page file privately;
- retry a failed read;
- soft-delete an invoice.

The checks are derived on read: the totals check (Task 4), the duplicate check (same supplier and number) and "quantity looks misread" (Task 3).

A read stuck in `reading` for over 10 minutes (the function died) is turned into `failed` / `read_timeout` when the list or the detail is loaded. The chef can then retry it.

**Files:**
- Create: `packages/shared/src/invoices-contract.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./invoices-contract";`)
- Create: `apps/api/lib/invoices/views.ts`
- Modify: `apps/api/app/api/invoices/route.ts` (add `GET`)
- Create: `apps/api/app/api/invoices/[id]/route.ts` (`GET`, `DELETE`)
- Create: `apps/api/app/api/invoices/[id]/pages/[position]/route.ts` (`GET`)
- Create: `apps/api/app/api/invoices/[id]/retry/route.ts` (`POST`)
- Test: `apps/api/app/api/invoices/__tests__/read-routes.test.ts`

**Interfaces:**
- Consumes:
  - `checkInvoiceTotals` (Task 4); `quantityLooksMisread` (Task 3); `openInvoiceFile` (Task 8); `readInvoiceSafely` (Task 11).
  - `findMatch` (`apps/api/lib/products/matching.ts`); `loadMatchCandidates`.
- Produces (in `@atelier/shared`):

```ts
// packages/shared/src/invoices-contract.ts
// Shapes of the invoice routes, shared with the mobile app (Plan 3).
import { z } from "zod";
import type { AmbiguousCandidate } from "./index";

export type InvoiceStatus = "uploading" | "reading" | "review" | "applied" | "failed";
export type InvoiceLineAction = "update_price" | "create_draft" | "connect" | "ignore";
export type InvoiceMatchLevel = "memory" | "exact" | "ai" | "probable" | "ambiguo" | "none" | "charge" | "chef";

export type InvoiceSummary = {
  id: string;
  status: InvoiceStatus;
  number: string | null;
  issuedOn: string | null; // YYYY-MM-DD
  grossTotalCents: number | null;
  netTotalCents: number | null;
  failureReason: string | null;
  createdAt: string;
};
export type InvoiceListResponse = {
  toReview: number;
  suppliers: Array<{ supplier: { id: string; name: string } | null; invoices: InvoiceSummary[] }>;
};

export type InvoiceLineView = {
  position: number;
  description: string;
  code: string | null;
  quantity: number | null;
  unit: string | null;
  packQty: number | null;
  packUnit: string | null;
  unitPriceCents: number | null;
  taxRatePct: number | null;
  lineTotalCents: number | null;
  matchLevel: InvoiceMatchLevel | null;
  action: InvoiceLineAction | null;
  appliedPriceCents: number | null;
  product: { id: string; name: string; unidadCompra: string; precioCompra: number; taxRatePct: number } | null;
  siblings: AmbiguousCandidate[];
  quantityLooksMisread: boolean;
};
export type InvoiceDetail = InvoiceSummary & {
  supplier: { id: string; name: string } | null;
  taxTotalCents: number | null;
  pages: Array<{ position: number; mimeType: string }>;
  lines: InvoiceLineView[];
  checks: {
    totals: { status: "ok" | "mismatch" | "unknown"; sumCents: number | null; diffCents: number | null };
    duplicateOf: string | null;
  };
};

export const invoiceLinePatchSchema = z.object({
  action: z.enum(["update_price", "create_draft", "connect", "ignore"]),
  productId: z.string().min(1).nullable().optional(),
  priceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
});
export type InvoiceLinePatch = z.infer<typeof invoiceLinePatchSchema>;
```

`matchLevel: "chef"` marks a product the chef chose by hand (Task 13). `invoiceLinePatchSchema` is used by Task 13 and lives here so that Plan 3 validates with the same rules.

  - `toInvoiceSummary(row): InvoiceSummary` and `groupBySupplier(rows): InvoiceListResponse["suppliers"]`, in `apps/api/lib/invoices/views.ts`.
  - `expireStuckReads(restaurantId: string, now: Date): Promise<void>`, in `views.ts`.
  - `STUCK_READ_MS = 10 * 60 * 1000`.

- [ ] **Step 1: Add the shared contract** (the code above) and its export in `packages/shared/src/index.ts`. Check that `AmbiguousCandidate` is exported from that index by Plan 1 (`rg -n "AmbiguousCandidate" packages/shared/src`); if it lives in another module, import it from that module instead.

Run: `cd packages/shared && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Write the failing route tests**

```ts
// apps/api/app/api/invoices/__tests__/read-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard, storage, reader, pipeline, after } = vi.hoisted(() => ({
  db: {
    invoice: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    invoicePage: { findFirst: vi.fn() },
  },
  guard: { requireAuth: vi.fn() },
  storage: { openInvoiceFile: vi.fn() },
  reader: { readInvoiceSafely: vi.fn() },
  pipeline: { loadMatchCandidates: vi.fn() },
  after: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/invoices/storage", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/invoices/storage")>()), ...storage }));
vi.mock("@/lib/invoices/read-invoice", () => reader);
vi.mock("@/lib/recipes/extraction-pipeline", () => pipeline);
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after }));

import { GET as list } from "../route";
import { GET as detail, DELETE as remove } from "../[id]/route";
import { GET as pageFile } from "../[id]/pages/[position]/route";
import { POST as retry } from "../[id]/retry/route";

const CTX = { userId: "u1", role: "sous_chef", restaurantId: "r1" };
const req = (url = "https://t.local/api/invoices") => new NextRequest(url);
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const row = (over: Record<string, unknown>) => ({
  id: "i", status: "review", number: "1", issuedOn: new Date("2026-10-10T00:00:00Z"), grossTotalCents: 100, netTotalCents: 90,
  failureReason: null, createdAt: new Date("2026-10-11T08:00:00Z"), supplier: { id: "s1", name: "Recchioni" }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue(CTX);
  db.invoice.updateMany.mockResolvedValue({ count: 0 });
  pipeline.loadMatchCandidates.mockResolvedValue([]);
});

describe("GET /api/invoices", () => {
  it("expires stuck reads of this restaurant first", async () => {
    db.invoice.findMany.mockResolvedValue([]);
    await list(req());
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { restaurantId: "r1", status: "reading", updatedAt: { lt: expect.any(Date) } },
      data: { status: "failed", failureReason: "read_timeout" },
    });
  });

  it("groups by supplier, newest first, hides uploads and counts what needs review", async () => {
    db.invoice.findMany.mockResolvedValue([
      row({ id: "a", issuedOn: new Date("2026-10-01T00:00:00Z") }),
      row({ id: "b", supplier: { id: "s2", name: "MARR" }, issuedOn: new Date("2026-10-12T00:00:00Z"), status: "applied" }),
      row({ id: "c", issuedOn: null, createdAt: new Date("2026-10-13T08:00:00Z") }),
    ]);
    const body = await (await list(req())).json();
    expect(db.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: "r1", deletedAt: null, status: { not: "uploading" } },
    }));
    expect(body.toReview).toBe(2);
    expect(body.suppliers.map((g: { supplier: { name: string } }) => g.supplier.name)).toEqual(["Recchioni", "MARR"]);
    expect(body.suppliers[0].invoices.map((i: { id: string }) => i.id)).toEqual(["c", "a"]);
    expect(body.suppliers[0].invoices[1]).toMatchObject({ issuedOn: "2026-10-01" });
  });
});

describe("GET /api/invoices/[id]", () => {
  const invoice = (lines: unknown[]) => ({
    ...row({ id: "inv1" }), supplierId: "s1", taxTotalCents: 10,
    pages: [{ position: 0, mimeType: "image/jpeg" }], lines,
  });
  const dbLine = (over: Record<string, unknown>) => ({
    position: 0, description: "Calamari", code: null, quantity: { toNumber: () => 2 }, unit: "kg", packQty: null, packUnit: null,
    unitPriceCents: 45, taxRatePct: { toNumber: () => 10 }, lineTotalCents: 90, matchLevel: "exact", action: "update_price",
    appliedPriceCents: 45, product: { id: "p1", name: "Calamari", unidadCompra: "kg", precioCompra: 40, taxRatePct: { toNumber: () => 10 } }, ...over,
  });

  it("is scoped to the restaurant and never exposes storage keys", async () => {
    db.invoice.findFirst.mockResolvedValueOnce(invoice([dbLine({})])).mockResolvedValueOnce(null);
    const body = await (await detail(req(), params({ id: "inv1" }))).json();
    expect(db.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv1", restaurantId: "r1", deletedAt: null } }));
    expect(JSON.stringify(body)).not.toContain("storageKey");
    expect(body.lines[0]).toMatchObject({ quantity: 2, taxRatePct: 10, product: { taxRatePct: 10 }, quantityLooksMisread: false });
    expect(body.checks).toEqual({ totals: { status: "ok", sumCents: 90, diffCents: 0 }, duplicateOf: null });
  });

  it("flags a second invoice with the same supplier and number", async () => {
    db.invoice.findFirst.mockResolvedValueOnce(invoice([dbLine({})])).mockResolvedValueOnce({ id: "older" });
    const body = await (await detail(req(), params({ id: "inv1" }))).json();
    expect(db.invoice.findFirst).toHaveBeenLastCalledWith({
      where: { id: { not: "inv1" }, restaurantId: "r1", supplierId: "s1", number: "1", deletedAt: null },
      select: { id: true }, orderBy: { createdAt: "asc" },
    });
    expect(body.checks.duplicateOf).toBe("older");
  });

  it("offers the sibling products for an ambiguous line", async () => {
    pipeline.loadMatchCandidates.mockResolvedValue([
      { id: "g1", name: "Gambero rosso Mazara", aliases: [] }, { id: "g2", name: "Gambero rosso Sicilia", aliases: [] },
    ]);
    db.invoice.findFirst.mockResolvedValueOnce(invoice([dbLine({ description: "Gambero rosso", matchLevel: "ambiguo", action: null, product: null })])).mockResolvedValueOnce(null);
    const body = await (await detail(req(), params({ id: "inv1" }))).json();
    expect(body.lines[0].siblings.map((s: { id: string }) => s.id)).toEqual(["g1", "g2"]);
  });

  it("another restaurant's invoice is not found", async () => {
    db.invoice.findFirst.mockResolvedValue(null);
    expect((await detail(req(), params({ id: "inv1" }))).status).toBe(404);
  });
});

describe("GET /api/invoices/[id]/pages/[position]", () => {
  it("streams the file privately", async () => {
    db.invoicePage.findFirst.mockResolvedValue({ storageKey: "invoices/r1/inv1/a.jpg" });
    storage.openInvoiceFile.mockResolvedValue({ stream: new Response("img").body, contentType: "image/jpeg" });
    const res = await pageFile(req(), params({ id: "inv1", position: "0" }));
    expect(db.invoicePage.findFirst).toHaveBeenCalledWith({
      where: { position: 0, invoice: { id: "inv1", restaurantId: "r1", deletedAt: null } }, select: { storageKey: true },
    });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(await res.text()).toBe("img");
  });

  it.each([["x"], ["-1"], ["1.5"]])("rejects position %j", async (position) => {
    expect((await pageFile(req(), params({ id: "inv1", position }))).status).toBe(404);
    expect(db.invoicePage.findFirst).not.toHaveBeenCalled();
  });

  it("a file gone from storage is 404", async () => {
    db.invoicePage.findFirst.mockResolvedValue({ storageKey: "k" });
    storage.openInvoiceFile.mockResolvedValue(null);
    expect((await pageFile(req(), params({ id: "inv1", position: "0" }))).status).toBe(404);
  });
});

describe("POST /api/invoices/[id]/retry", () => {
  it("only a failed invoice is read again", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
    const res = await retry(new NextRequest("https://t.local/x", { method: "POST" }), params({ id: "inv1" }));
    expect(res.status).toBe(202);
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", restaurantId: "r1", deletedAt: null, status: "failed" },
      data: { status: "reading", failureReason: null },
    });
    await after.mock.calls[0]![0]();
    expect(reader.readInvoiceSafely).toHaveBeenCalledWith("inv1");
  });

  it("anything else is a conflict", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 0 });
    expect((await retry(new NextRequest("https://t.local/x", { method: "POST" }), params({ id: "inv1" }))).status).toBe(409);
    expect(after).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/invoices/[id]", () => {
  it("moves the invoice to the trash", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
    expect((await remove(req(), params({ id: "inv1" }))).status).toBe(200);
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", restaurantId: "r1", deletedAt: null }, data: { deletedAt: expect.any(Date) },
    });
  });

  it("an unknown invoice is 404", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 0 });
    expect((await remove(req(), params({ id: "inv1" }))).status).toBe(404);
  });
});
```

In the detail test, the totals case is "ok". The one line totals 90, the printed net is 90, and the printed gross (100) also matches: 90 × 1.10 = 99, which is within the tolerance of 2.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec vitest run app/api/invoices/__tests__/read-routes.test.ts`
Expected: FAIL. `GET` is not exported from `../route`, and the other route modules do not exist yet.

- [ ] **Step 4: Implement the views helper**

```ts
// apps/api/lib/invoices/views.ts
// Response shapes for the invoice routes, and the stuck-read sweep.
import { prisma } from "@atelier/db";
import type { InvoiceListResponse, InvoiceSummary } from "@atelier/shared";

// A read that has not finished in 10 minutes died with its function (the read itself
// stops at 4.5 minutes). Expired when the list or the detail is loaded, so the chef can retry.
export const STUCK_READ_MS = 10 * 60 * 1000;

export async function expireStuckReads(restaurantId: string, now: Date): Promise<void> {
  await prisma.invoice.updateMany({
    where: { restaurantId, status: "reading", updatedAt: { lt: new Date(+now - STUCK_READ_MS) } },
    data: { status: "failed", failureReason: "read_timeout" },
  });
}

type SummaryRow = {
  id: string; status: InvoiceSummary["status"]; number: string | null; issuedOn: Date | null;
  grossTotalCents: number | null; netTotalCents: number | null; failureReason: string | null; createdAt: Date;
};

export function toInvoiceSummary(row: SummaryRow): InvoiceSummary {
  return {
    id: row.id, status: row.status, number: row.number,
    issuedOn: row.issuedOn ? row.issuedOn.toISOString().slice(0, 10) : null,
    grossTotalCents: row.grossTotalCents, netTotalCents: row.netTotalCents,
    failureReason: row.failureReason, createdAt: row.createdAt.toISOString(),
  };
}

// The date that orders the archive: the printed date, else the upload day.
const sortDate = (row: SummaryRow) => (row.issuedOn ?? row.createdAt).getTime();

export function groupBySupplier(rows: ReadonlyArray<SummaryRow & { supplier: { id: string; name: string } | null }>): InvoiceListResponse["suppliers"] {
  const sorted = [...rows].sort((a, b) => sortDate(b) - sortDate(a) || b.createdAt.getTime() - a.createdAt.getTime());
  const groups = new Map<string, InvoiceListResponse["suppliers"][number]>();
  for (const row of sorted) {
    const key = row.supplier?.id ?? "";
    if (!groups.has(key)) groups.set(key, { supplier: row.supplier, invoices: [] });
    groups.get(key)!.invoices.push(toInvoiceSummary(row));
  }
  return [...groups.values()];
}
```

- [ ] **Step 5: Implement the routes**

Add to `apps/api/app/api/invoices/route.ts`. The new imports go at the top: `expireStuckReads` and `groupBySupplier` from `@/lib/invoices/views`, and `InvoiceListResponse` from `@atelier/shared`.

```ts
export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  await expireStuckReads(ctx.restaurantId, new Date());
  const rows = await prisma.invoice.findMany({
    where: { restaurantId: ctx.restaurantId, deletedAt: null, status: { not: "uploading" } },
    select: {
      id: true, status: true, number: true, issuedOn: true, grossTotalCents: true, netTotalCents: true,
      failureReason: true, createdAt: true, supplier: { select: { id: true, name: true } },
    },
  });
  const body: InvoiceListResponse = {
    toReview: rows.filter((r) => r.status === "review").length,
    suppliers: groupBySupplier(rows),
  };
  return NextResponse.json(body);
}
```

```ts
// apps/api/app/api/invoices/[id]/route.ts
// GET: one invoice with its lines and the checks derived from them. DELETE: to the trash
// (purged with its files after 7 days, Task 15).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import type { InvoiceDetail, InvoiceLineView } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { loadMatchCandidates } from "@/lib/recipes/extraction-pipeline";
import { findMatch } from "@/lib/products/matching";
import { quantityLooksMisread } from "@/lib/invoices/pricing";
import { checkInvoiceTotals } from "@/lib/invoices/totals";
import { expireStuckReads, toInvoiceSummary } from "@/lib/invoices/views";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

export async function GET(req: NextRequest, { params }: Params) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;
  await expireStuckReads(ctx.restaurantId, new Date());

  const invoice = await prisma.invoice.findFirst({
    where: { id, restaurantId: ctx.restaurantId, deletedAt: null },
    include: {
      supplier: { select: { id: true, name: true } },
      pages: { orderBy: { position: "asc" }, select: { position: true, mimeType: true } },
      lines: {
        orderBy: { position: "asc" },
        include: { product: { select: { id: true, name: true, unidadCompra: true, precioCompra: true, taxRatePct: true } } },
      },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found", code: "invoice_not_found" }, { status: 404 });

  const duplicate = invoice.supplierId && invoice.number
    ? await prisma.invoice.findFirst({
        where: { id: { not: id }, restaurantId: ctx.restaurantId, supplierId: invoice.supplierId, number: invoice.number, deletedAt: null },
        select: { id: true }, orderBy: { createdAt: "asc" },
      })
    : null;
  const candidates = invoice.lines.some((l) => l.matchLevel === "ambiguo") ? await loadMatchCandidates(ctx.restaurantId) : [];

  const lines: InvoiceLineView[] = invoice.lines.map((l) => {
    const view = {
      quantity: num(l.quantity), unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents,
    };
    return {
      position: l.position, description: l.description, code: l.code, quantity: view.quantity, unit: l.unit,
      packQty: num(l.packQty), packUnit: l.packUnit, unitPriceCents: l.unitPriceCents, taxRatePct: num(l.taxRatePct),
      lineTotalCents: l.lineTotalCents, matchLevel: l.matchLevel as InvoiceLineView["matchLevel"], action: l.action,
      appliedPriceCents: l.appliedPriceCents,
      product: l.product ? { ...l.product, taxRatePct: l.product.taxRatePct.toNumber() } : null,
      siblings: l.matchLevel === "ambiguo" ? findMatch(l.description, candidates).candidates : [],
      quantityLooksMisread: quantityLooksMisread(view),
    };
  });

  const body: InvoiceDetail = {
    ...toInvoiceSummary(invoice),
    supplier: invoice.supplier,
    taxTotalCents: invoice.taxTotalCents,
    pages: invoice.pages,
    lines,
    checks: {
      totals: checkInvoiceTotals(lines, { netTotalCents: invoice.netTotalCents, grossTotalCents: invoice.grossTotalCents }),
      duplicateOf: duplicate?.id ?? null,
    },
  };
  return NextResponse.json(body);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;
  const moved = await prisma.invoice.updateMany({
    where: { id, restaurantId: ctx.restaurantId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (moved.count === 0) return NextResponse.json({ error: "Not found", code: "invoice_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

```ts
// apps/api/app/api/invoices/[id]/pages/[position]/route.ts
// Streams one original page to an authorized user of the same restaurant. The file is
// private: it is never cached by shared caches and its storage key never leaves the server.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { openInvoiceFile } from "@/lib/invoices/storage";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not found", code: "invoice_page_not_found" }, { status: 404 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; position: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id, position: raw } = await params;
  if (!/^\d+$/.test(raw)) return notFound();

  const page = await prisma.invoicePage.findFirst({
    where: { position: Number(raw), invoice: { id, restaurantId: ctx.restaurantId, deletedAt: null } },
    select: { storageKey: true },
  });
  if (!page) return notFound();
  const file = await openInvoiceFile(page.storageKey);
  if (!file) return notFound();
  return new Response(file.stream, { headers: { "Content-Type": file.contentType, "Cache-Control": "private, no-store" } });
}
```

```ts
// apps/api/app/api/invoices/[id]/retry/route.ts
// Reads a failed invoice again (failed -> reading), in the background.
import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { readInvoiceSafely } from "@/lib/invoices/read-invoice";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;
  const claimed = await prisma.invoice.updateMany({
    where: { id, restaurantId: ctx.restaurantId, deletedAt: null, status: "failed" },
    data: { status: "reading", failureReason: null },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Only a failed invoice can be read again", code: "invoice_not_failed" }, { status: 409 });
  }
  after(() => readInvoiceSafely(id));
  return NextResponse.json({ id, status: "reading" }, { status: 202 });
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd apps/api && pnpm exec vitest run app/api/invoices && pnpm exec tsc --noEmit && cd ../../packages/shared && pnpm exec vitest run`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/invoices-contract.ts packages/shared/src/index.ts apps/api/lib/invoices/views.ts apps/api/app/api/invoices
git commit -m "feat(invoices): list, detail with checks, private page file, retry and delete"
```

---

### Task 13: The chef's decision on one line

On the review screen the chef can:
- confirm or change the product;
- choose the sibling of an ambiguous family;
- tick a big price change;
- create a draft instead;
- connect a product without touching its price;
- ignore the line.

Each tap is one `PATCH`. The write is fenced on the invoice still being `review`, so it cannot change an invoice that was applied meanwhile.

**Files:**
- Create: `apps/api/app/api/invoices/[id]/lines/[position]/route.ts`
- Test: `apps/api/app/api/invoices/__tests__/line-patch.test.ts`

**Interfaces:**
- Consumes:
  - `invoiceLinePatchSchema` (Task 12).
  - `priceInBankUnit` and `draftUnitFor` (Task 3).
- Produces: `PATCH /api/invoices/[id]/lines/[position]` with body `InvoiceLinePatch`. It returns `200 { position, action, productId, appliedPriceCents, matchLevel }`. Errors:
  - `invalid_body` (400), `product_required` (400), `price_required` (400);
  - `invoice_line_not_found` (404), `product_not_found` (404);
  - `invoice_not_in_review` (409).

Rules:
- `update_price` and `connect` need a product. It is the body's `productId`, or the line's current one. It must belong to the same restaurant and must not be deleted.
- When the product changes and the body sends no price, the price is recomputed in the new product's unit. A price sent by the chef always wins.
- `create_draft` and `ignore` clear the product. `ignore` also clears the price. Switching from a product to a draft re-prices the line in the draft's own unit.
- `update_price` with no price is refused.
- A product chosen by hand gets `matchLevel: "chef"`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/app/api/invoices/__tests__/line-patch.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => ({
  db: { invoiceLine: { findFirst: vi.fn(), updateMany: vi.fn() }, product: { findFirst: vi.fn() } },
  guard: { requireAuth: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
import { PATCH } from "../[id]/lines/[position]/route";

const CTX = { userId: "u1", role: "admin", restaurantId: "r1" };
const patch = (body: unknown, position = "0") =>
  PATCH(new NextRequest("https://t.local/x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "inv1", position }) });
const dec = (n: number) => ({ toNumber: () => n });
const stored = (over: Record<string, unknown> = {}) => ({
  id: "l1", position: 0, description: "Calamari 3P", quantity: dec(2), unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 1100, lineTotalCents: 2200, productId: "p1", matchLevel: "probable", appliedPriceCents: 1100,
  invoice: { status: "review" }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue(CTX);
  db.invoiceLine.findFirst.mockResolvedValue(stored());
  db.invoiceLine.updateMany.mockResolvedValue({ count: 1 });
  db.product.findFirst.mockResolvedValue({ id: "p1", unidadCompra: "kg" });
});

const written = () => db.invoiceLine.updateMany.mock.calls[0]![0];

describe("PATCH /api/invoices/[id]/lines/[position]", () => {
  it("looks the line up through this restaurant's live invoice", async () => {
    await patch({ action: "update_price" });
    expect(db.invoiceLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { position: 0, invoice: { id: "inv1", restaurantId: "r1", deletedAt: null } },
    }));
  });

  it("confirming the proposal keeps product and price", async () => {
    const res = await patch({ action: "update_price" });
    expect(res.status).toBe(200);
    expect(written()).toEqual({
      where: { id: "l1", invoice: { status: "review" } },
      data: { action: "update_price", productId: "p1", appliedPriceCents: 1100, matchLevel: "probable" },
    });
  });

  it("choosing another product re-prices the line in its unit and marks it as the chef's", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(stored({ unitPriceCents: 11000, lineTotalCents: 22000, appliedPriceCents: 11000 }));
    db.product.findFirst.mockResolvedValue({ id: "p2", unidadCompra: "g" });
    await patch({ action: "update_price", productId: "p2" });
    expect(db.product.findFirst).toHaveBeenCalledWith({ where: { id: "p2", restaurantId: "r1", deletedAt: null }, select: { id: true, unidadCompra: true } });
    // 110 €/kg in a bank kept in grams: 11 cents per gram.
    expect(written().data).toEqual({ action: "update_price", productId: "p2", appliedPriceCents: 11, matchLevel: "chef" });
  });

  it("a price typed by the chef wins", async () => {
    await patch({ action: "update_price", priceCents: 1050 });
    expect(written().data).toMatchObject({ appliedPriceCents: 1050 });
  });

  it("a product of another restaurant, or deleted, is refused", async () => {
    db.product.findFirst.mockResolvedValue(null);
    const res = await patch({ action: "connect", productId: "foreign" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "product_not_found" });
    expect(db.invoiceLine.updateMany).not.toHaveBeenCalled();
  });

  it("connect needs a product", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(stored({ productId: null }));
    expect(await (await patch({ action: "connect" })).json()).toMatchObject({ code: "product_required" });
  });

  it("update_price needs a price", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(stored({ appliedPriceCents: null }));
    expect(await (await patch({ action: "update_price" })).json()).toMatchObject({ code: "price_required" });
  });

  it("a draft drops the product and re-prices in its own unit", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(stored({ appliedPriceCents: 99 }));
    await patch({ action: "create_draft" });
    expect(written().data).toEqual({ action: "create_draft", productId: null, appliedPriceCents: 1100, matchLevel: "probable" });
  });

  it("ignoring clears product and price", async () => {
    await patch({ action: "ignore" });
    expect(written().data).toEqual({ action: "ignore", productId: null, appliedPriceCents: null, matchLevel: "probable" });
  });

  it("an invoice no longer in review is refused, also when it changed meanwhile", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(stored({ invoice: { status: "applied" } }));
    expect((await patch({ action: "ignore" })).status).toBe(409);
    db.invoiceLine.findFirst.mockResolvedValue(stored());
    db.invoiceLine.updateMany.mockResolvedValue({ count: 0 });
    expect(await (await patch({ action: "ignore" })).json()).toMatchObject({ code: "invoice_not_in_review" });
  });

  it.each([[{ action: "delete" }], [{ action: "update_price", priceCents: -1 }], [null]])("rejects body %j", async (body) => {
    expect((await patch(body)).status).toBe(400);
  });

  it("an unknown position is 404", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(null);
    expect((await patch({ action: "ignore" }, "7")).status).toBe(404);
    expect((await patch({ action: "ignore" }, "x")).status).toBe(404);
  });
});
```

The re-pricing case uses 110 €/kg on purpose. 11 €/kg would be 1.1 cents per gram, which `priceInBankUnit` turns into `null`: the rounding error (9%) is above `MAX_ROUNDING_ERROR` (Task 3, minor #7).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec vitest run app/api/invoices/__tests__/line-patch.test.ts`
Expected: FAIL with `Failed to resolve import "../[id]/lines/[position]/route"`.

- [ ] **Step 3: Implement**

```ts
// apps/api/app/api/invoices/[id]/lines/[position]/route.ts
// The chef's decision on one line of an invoice under review. Fenced on the invoice still
// being in review, so nothing changes on an invoice applied meanwhile.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { invoiceLinePatchSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { draftUnitFor, priceInBankUnit } from "@/lib/invoices/pricing";

export const dynamic = "force-dynamic";

const fail = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status });
const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; position: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id, position: raw } = await params;
  if (!/^\d+$/.test(raw)) return fail(404, "invoice_line_not_found", "Not found");
  const parsed = invoiceLinePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_body", "Invalid body");
  const body = parsed.data;

  const line = await prisma.invoiceLine.findFirst({
    where: { position: Number(raw), invoice: { id, restaurantId: ctx.restaurantId, deletedAt: null } },
    select: {
      id: true, position: true, description: true, quantity: true, unit: true, packQty: true, packUnit: true,
      unitPriceCents: true, lineTotalCents: true, productId: true, matchLevel: true, appliedPriceCents: true,
      invoice: { select: { status: true } },
    },
  });
  if (!line) return fail(404, "invoice_line_not_found", "Not found");
  if (line.invoice.status !== "review") return fail(409, "invoice_not_in_review", "The invoice is not in review");

  const priced = { ...line, quantity: num(line.quantity), packQty: num(line.packQty) };
  let productId: string | null = null;
  let price = body.priceCents !== undefined ? body.priceCents : line.appliedPriceCents;
  let matchLevel = line.matchLevel;

  if (body.action === "update_price" || body.action === "connect") {
    productId = body.productId ?? line.productId;
    if (!productId) return fail(400, "product_required", "Choose a product");
    const product = await prisma.product.findFirst({
      where: { id: productId, restaurantId: ctx.restaurantId, deletedAt: null },
      select: { id: true, unidadCompra: true },
    });
    if (!product) return fail(404, "product_not_found", "Product not found");
    if (productId !== line.productId) {
      matchLevel = "chef";
      if (body.priceCents === undefined) price = priceInBankUnit(priced, product.unidadCompra);
    }
  } else if (body.action === "create_draft" && body.priceCents === undefined && line.productId !== null) {
    const unit = draftUnitFor(priced);
    price = unit ? priceInBankUnit(priced, unit) : null;
  }
  if (body.action === "ignore") price = null;
  if (body.action === "update_price" && price === null) return fail(400, "price_required", "Enter a price");

  const data = { action: body.action, productId, appliedPriceCents: price, matchLevel };
  const updated = await prisma.invoiceLine.updateMany({ where: { id: line.id, invoice: { status: "review" } }, data });
  if (updated.count === 0) return fail(409, "invoice_not_in_review", "The invoice is not in review");
  return NextResponse.json({ position: line.position, ...data });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec vitest run app/api/invoices/__tests__/line-patch.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/api/app/api/invoices/[id]/lines" apps/api/app/api/invoices/__tests__/line-patch.test.ts
git commit -m "feat(invoices): record the chef's decision on each invoice line"
```

---

### Task 14: Apply a reviewed invoice

One transaction:
1. Claims `review` → `applied`.
2. Refuses if any line is undecided, which rolls everything back.
3. Applies each line.

After the commit, the supplier memory is written, best effort.

What each action does:

| Action | Effect |
|---|---|
| `update_price` | Sets `precioCompra`, plus `precioActualizadoAt` = the invoice date at 12:00 UTC (minor #5). Sets `taxRatePct` only when the line has one. Writes a history row with `invoiceLineId` and the author. |
| `create_draft` | Creates a draft product with the line's price, unit and tax, through the draft code extracted from `recipe-save.ts`. Writes a history row when it has a price. |
| `connect` | Links the product only. |
| `ignore` | Nothing. |

Skipped lines are reported, never forced:
- a product deleted since review gives `product_deleted`;
- a product whose price is newer than this invoice gives `newer_price` (spec: an older invoice never overwrites).

**Files:**
- Create: `apps/api/lib/products/drafts.ts`
- Modify: `apps/api/lib/products/recipe-save.ts:136-142` (use `createDraftProduct`)
- Create: `apps/api/lib/invoices/supplier-memory.ts`
- Create: `apps/api/lib/invoices/apply.ts`
- Create: `apps/api/app/api/invoices/[id]/apply/route.ts`
- Test: `apps/api/lib/products/drafts.test.ts`
- Test: `apps/api/lib/invoices/supplier-memory.test.ts`
- Test: `apps/api/lib/invoices/apply.test.ts`
- Test: `apps/api/app/api/invoices/__tests__/apply-route.test.ts`

**Interfaces:**
- Consumes:
  - `draftUnitFor` (Task 3).
  - `normalizeCode` and `normalizeDescription` (Task 5).
  - `categorizeFromName` and `suggestedMermaPct` (`../products/defaults`), `defaultPurchaseUnit` (`./purchase-unit`), `defaultCriticality` (`./criticality`), `detectPezzaturaFromName` (`@atelier/shared`).
- Produces:
  - `createDraftProduct(tx: Prisma.TransactionClient, input: { restaurantId: string; name: string; unidadCompra?: ProductUnit; precioCompra?: number; taxRatePct?: number | null; precioActualizadoAt?: Date }): Promise<{ id: string; name: string; aliases: string[] }>`
  - `type MemoryEntry = { code: string | null; description: string; productId: string; packQty: number | null; packUnit: string | null; priceCents: number | null }`
  - `rememberSupplierItems(supplierId: string, entries: ReadonlyArray<MemoryEntry>): Promise<void>`, which never throws.
  - `type ApplyResult`, one of:
    - `{ status: "applied"; updated: number; drafts: number; connected: number; ignored: number; skipped: Array<{ position: number; reason: "product_deleted" | "newer_price" }> }`
    - `{ status: "already_applied" }`
    - `{ status: "error"; code: "invoice_not_found" | "invoice_not_in_review" | "lines_undecided"; positions?: number[] }`
  - `applyInvoice(input: { invoiceId: string; restaurantId: string; userId: string; now?: Date }): Promise<ApplyResult>`
  - `POST /api/invoices/[id]/apply`, with three outcomes:
    - `200` with the applied counts;
    - `200 { alreadyApplied: true }`;
    - `404` / `409` with `{ code, positions? }`.

- [ ] **Step 1: Write the failing test for the extracted draft creation**

```ts
// apps/api/lib/products/drafts.test.ts
import { describe, expect, it, vi } from "vitest";
import { createDraftProduct } from "./drafts";

const tx = () => ({ product: { create: vi.fn(async ({ data }) => ({ id: "new", name: data.name, aliases: [] })) } });

describe("createDraftProduct", () => {
  it("creates a draft with the kitchen defaults for its name", async () => {
    const t = tx();
    await createDraftProduct(t as never, { restaurantId: "r1", name: "Zucchine" });
    expect(t.product.create.mock.calls[0]![0].data).toMatchObject({
      restaurantId: "r1", name: "Zucchine", precioCompra: 0, estado: "borrador", mermaOrigen: "sugerida", criticalityManual: false,
    });
    expect(t.product.create.mock.calls[0]![0].data).not.toHaveProperty("taxRatePct");
  });

  it("takes the invoice's unit, price, tax and price date", async () => {
    const t = tx();
    const at = new Date("2026-10-10T12:00:00Z");
    await createDraftProduct(t as never, { restaurantId: "r1", name: "Zucchine", unidadCompra: "kg", precioCompra: 180, taxRatePct: 4, precioActualizadoAt: at });
    expect(t.product.create.mock.calls[0]![0].data).toMatchObject({ unidadCompra: "kg", precioCompra: 180, taxRatePct: 4, precioActualizadoAt: at });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec vitest run lib/products/drafts.test.ts`
Expected: FAIL with `Failed to resolve import "./drafts"`.

- [ ] **Step 3: Extract the draft creation**

```ts
// apps/api/lib/products/drafts.ts
// A draft product created from a name the bank does not know (recipe import or invoice line),
// with the kitchen defaults for that name. The chef completes it later in the bank.
import type { Prisma, ProductUnit } from "@atelier/db";
import { detectPezzaturaFromName } from "@atelier/shared";
import { categorizeFromName, suggestedMermaPct } from "./defaults";
import { defaultPurchaseUnit } from "./purchase-unit";
import { defaultCriticality } from "./criticality";

export async function createDraftProduct(
  tx: Prisma.TransactionClient,
  input: { restaurantId: string; name: string; unidadCompra?: ProductUnit; precioCompra?: number; taxRatePct?: number | null; precioActualizadoAt?: Date },
): Promise<{ id: string; name: string; aliases: string[] }> {
  const { restaurantId, name } = input;
  const category = categorizeFromName(name);
  const pezzatura = detectPezzaturaFromName(name, category);
  return tx.product.create({
    data: {
      restaurantId, name, category, unidadCompra: input.unidadCompra ?? defaultPurchaseUnit(category, name),
      precioCompra: input.precioCompra ?? 0,
      ...(input.taxRatePct != null ? { taxRatePct: input.taxRatePct } : {}),
      ...(input.precioActualizadoAt ? { precioActualizadoAt: input.precioActualizadoAt } : {}),
      mermaPct: suggestedMermaPct(name, category), mermaOrigen: "sugerida", estado: "borrador",
      criticality: defaultCriticality(category, name), criticalityManual: false,
      pezzaturaMode: pezzatura?.mode ?? null, pezzaturaMin: pezzatura?.min ?? null, pezzaturaMax: pezzatura?.max ?? null,
    },
    select: { id: true, name: true, aliases: true },
  });
}
```

In `apps/api/lib/products/recipe-save.ts`, replace the inline `tx.product.create({ data: { ... } })` block (lines 136-142) with:

```ts
        const created = await createDraftProduct(tx, { restaurantId, name });
```

Then:
- add `import { createDraftProduct } from "./drafts";`;
- remove the imports that are now unused (`categorizeFromName`, `suggestedMermaPct`, `defaultPurchaseUnit`, `defaultCriticality`, `detectPezzaturaFromName`), only if nothing else in the file uses them (check with `rg`).

The `select` changes what `tx.product.create` returns to `{ id, name, aliases }`. That is all `recipe-save.ts` reads from it (`created.id`, `created.name`, `created.aliases`).

- [ ] **Step 4: Run the draft test and the recipe-save tests**

Run: `cd apps/api && pnpm exec vitest run lib/products`
Expected: PASS, including the existing `recipe-save` tests unchanged. They pin the previous draft behaviour (Plan 1 rule: every touched behaviour keeps a test). If a `recipe-save` test asserts the exact `create` argument, add `select: { id: true, name: true, aliases: true }` to that assertion. Make no other change to it.

- [ ] **Step 5: Write the failing test for supplier memory**

```ts
// apps/api/lib/invoices/supplier-memory.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, log } = vi.hoisted(() => ({
  db: { supplierItem: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() } },
  log: { warn: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("../logger", () => ({ logger: log }));
import { rememberSupplierItems } from "./supplier-memory";

const entry = { code: " cc3ppu ", description: "CALAMARI 3P PULITI", productId: "p1", packQty: null, packUnit: null, priceCents: 1100 };
beforeEach(() => { vi.clearAllMocks(); db.supplierItem.findUnique.mockResolvedValue(null); });

describe("rememberSupplierItems", () => {
  it("stores normalized code and description", async () => {
    await rememberSupplierItems("s1", [entry]);
    expect(db.supplierItem.upsert).toHaveBeenCalledWith({
      where: { supplierId_descriptionNorm: { supplierId: "s1", descriptionNorm: "calamari 3p puliti" } },
      create: { supplierId: "s1", code: "CC3PPU", descriptionNorm: "calamari 3p puliti", productId: "p1", packQty: null, packUnit: null, lastPriceCents: 1100 },
      update: { code: "CC3PPU", productId: "p1", packQty: null, packUnit: null, lastPriceCents: 1100 },
    });
  });

  it("an empty code is stored as null, never as an empty string", async () => {
    await rememberSupplierItems("s1", [{ ...entry, code: "  " }]);
    expect(db.supplierItem.findUnique).not.toHaveBeenCalled();
    expect(db.supplierItem.upsert.mock.calls[0]![0].create.code).toBeNull();
    expect(db.supplierItem.upsert.mock.calls[0]![0].update).not.toHaveProperty("code");
  });

  it("a known code updates that entry even when the description changed", async () => {
    db.supplierItem.findUnique.mockResolvedValue({ id: "si1" });
    await rememberSupplierItems("s1", [entry]);
    expect(db.supplierItem.update).toHaveBeenCalledWith({ where: { id: "si1" }, data: { productId: "p1", packQty: null, packUnit: null, lastPriceCents: 1100 } });
    expect(db.supplierItem.upsert).not.toHaveBeenCalled();
  });

  it("a unique clash from a concurrent apply is logged and the rest continue", async () => {
    db.supplierItem.upsert.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(rememberSupplierItems("s1", [entry, { ...entry, code: null, description: "COZZE" }])).resolves.toBeUndefined();
    expect(db.supplierItem.upsert).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith("invoice_memory_failed", expect.objectContaining({ code: "P2002" }));
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/supplier-memory.test.ts`
Expected: FAIL with `Failed to resolve import "./supplier-memory"`.

- [ ] **Step 7: Implement supplier memory**

```ts
// apps/api/lib/invoices/supplier-memory.ts
// What the chef confirmed on an applied invoice: "this code / description from this supplier
// is that product". A cache for the next invoice, so every write is best effort.
import { prisma } from "@atelier/db";
import { logger } from "../logger";
import { normalizeCode, normalizeDescription } from "./line-matching";

export type MemoryEntry = { code: string | null; description: string; productId: string; packQty: number | null; packUnit: string | null; priceCents: number | null };

export async function rememberSupplierItems(supplierId: string, entries: ReadonlyArray<MemoryEntry>): Promise<void> {
  for (const entry of entries) {
    const code = normalizeCode(entry.code);
    const descriptionNorm = normalizeDescription(entry.description);
    const fields = { productId: entry.productId, packQty: entry.packQty, packUnit: entry.packUnit, lastPriceCents: entry.priceCents };
    try {
      const byCode = code ? await prisma.supplierItem.findUnique({ where: { supplierId_code: { supplierId, code } }, select: { id: true } }) : null;
      if (byCode) {
        await prisma.supplierItem.update({ where: { id: byCode.id }, data: fields });
        continue;
      }
      await prisma.supplierItem.upsert({
        where: { supplierId_descriptionNorm: { supplierId, descriptionNorm } },
        create: { supplierId, code, descriptionNorm, ...fields },
        update: code ? { code, ...fields } : fields,
      });
    } catch (error) {
      const errorCode = (error as { code?: unknown }).code;
      logger.warn("invoice_memory_failed", { supplierId, code: typeof errorCode === "string" ? errorCode : undefined, message: error instanceof Error ? error.message : String(error) });
    }
  }
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/supplier-memory.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing test for apply**

```ts
// apps/api/lib/invoices/apply.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, tx, drafts, memory } = vi.hoisted(() => {
  const tx = {
    invoice: { findFirst: vi.fn(), updateMany: vi.fn() },
    invoiceLine: { findMany: vi.fn(), update: vi.fn() },
    product: { findFirst: vi.fn(), update: vi.fn() },
    productPriceHistory: { create: vi.fn() },
  };
  return {
    tx,
    db: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) },
    drafts: { createDraftProduct: vi.fn() },
    memory: { rememberSupplierItems: vi.fn() },
  };
});
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("../products/drafts", () => drafts);
vi.mock("./supplier-memory", () => memory);
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import { applyInvoice } from "./apply";

const dec = (n: number) => ({ toNumber: () => n });
const line = (over: Record<string, unknown>) => ({
  id: "l0", position: 0, description: "Zucchine", code: "ZU1", quantity: dec(2), unit: "kg", packQty: null, packUnit: null,
  taxRatePct: dec(4), productId: "p1", action: "update_price", appliedPriceCents: 180, ...over,
});
const NOW = new Date("2026-10-15T09:00:00Z");
const PRICE_DAY = new Date("2026-10-10T12:00:00Z");
const run = () => applyInvoice({ invoiceId: "inv1", restaurantId: "r1", userId: "u1", now: NOW });

beforeEach(() => {
  vi.clearAllMocks();
  tx.invoice.findFirst.mockResolvedValue({ status: "review", supplierId: "s1", issuedOn: new Date("2026-10-10T00:00:00Z") });
  tx.invoice.updateMany.mockResolvedValue({ count: 1 });
  tx.invoiceLine.findMany.mockResolvedValue([line({})]);
  tx.product.findFirst.mockResolvedValue({ id: "p1", unidadCompra: "kg", precioCompra: 150, precioActualizadoAt: new Date("2026-10-01T12:00:00Z") });
  drafts.createDraftProduct.mockResolvedValue({ id: "new", name: "Fasolari", aliases: [] });
});

describe("applyInvoice", () => {
  it("claims the invoice inside the transaction, scoped to the restaurant", async () => {
    await run();
    expect(tx.invoice.findFirst).toHaveBeenCalledWith({ where: { id: "inv1", restaurantId: "r1", deletedAt: null }, select: { status: true, supplierId: true, issuedOn: true } });
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv1", status: "review" }, data: { status: "applied", appliedAt: NOW } });
  });

  it("updates the price dated at noon UTC of the invoice day, its tax and the history", async () => {
    expect(await run()).toEqual({ status: "applied", updated: 1, drafts: 0, connected: 0, ignored: 0, skipped: [] });
    expect(tx.product.findFirst).toHaveBeenCalledWith({
      where: { id: "p1", restaurantId: "r1", deletedAt: null },
      select: { id: true, unidadCompra: true, precioCompra: true, precioActualizadoAt: true },
    });
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { precioCompra: 180, precioActualizadoAt: PRICE_DAY, taxRatePct: 4 } });
    expect(tx.productPriceHistory.create).toHaveBeenCalledWith({ data: { productId: "p1", authorId: "u1", precio: 180, unidadCompra: "kg", invoiceLineId: "l0" } });
  });

  it("a tax rate the model did not read never overwrites the product's", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({ taxRatePct: null })]);
    await run();
    expect(tx.product.update.mock.calls[0]![0].data).not.toHaveProperty("taxRatePct");
  });

  it("a product deleted since review is skipped and reported", async () => {
    tx.product.findFirst.mockResolvedValue(null);
    expect(await run()).toMatchObject({ updated: 0, skipped: [{ position: 0, reason: "product_deleted" }] });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("a newer price is never overwritten by an older invoice", async () => {
    tx.product.findFirst.mockResolvedValue({ id: "p1", unidadCompra: "kg", precioCompra: 150, precioActualizadoAt: new Date("2026-10-12T08:00:00Z") });
    expect(await run()).toMatchObject({ updated: 0, skipped: [{ position: 0, reason: "newer_price" }] });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("creates a draft in the line's unit, links the line and records its price", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({ id: "l1", description: "Fasolari", productId: null, action: "create_draft", appliedPriceCents: 2500 })]);
    expect(await run()).toMatchObject({ drafts: 1 });
    expect(drafts.createDraftProduct).toHaveBeenCalledWith(tx, { restaurantId: "r1", name: "Fasolari", unidadCompra: "kg", precioCompra: 2500, taxRatePct: 4, precioActualizadoAt: PRICE_DAY });
    expect(tx.invoiceLine.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { productId: "new" } });
    expect(tx.productPriceHistory.create).toHaveBeenCalledWith({ data: { productId: "new", authorId: "u1", precio: 2500, unidadCompra: "kg", invoiceLineId: "l1" } });
  });

  it("a draft without a price gets no history row", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({ productId: null, action: "create_draft", appliedPriceCents: null, unit: null })]);
    await run();
    expect(drafts.createDraftProduct.mock.calls[0]![1]).toMatchObject({ precioCompra: 0 });
    expect(tx.productPriceHistory.create).not.toHaveBeenCalled();
  });

  it("connect and ignore write no price", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({ action: "connect" }), line({ id: "l1", position: 1, action: "ignore", productId: null })]);
    expect(await run()).toMatchObject({ connected: 1, ignored: 1, updated: 0 });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("an undecided line refuses the whole apply", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({}), line({ id: "l1", position: 1, action: null })]);
    expect(await run()).toEqual({ status: "error", code: "lines_undecided", positions: [1] });
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(memory.rememberSupplierItems).not.toHaveBeenCalled();
  });

  it("a second apply, at once or later, changes nothing", async () => {
    tx.invoice.updateMany.mockResolvedValue({ count: 0 });
    tx.invoice.findFirst.mockResolvedValue({ status: "applied", supplierId: "s1", issuedOn: null });
    expect(await run()).toEqual({ status: "already_applied" });
    expect(tx.invoiceLine.findMany).not.toHaveBeenCalled();
  });

  it.each([
    [null, "invoice_not_found"],
    [{ status: "reading", supplierId: null, issuedOn: null }, "invoice_not_in_review"],
  ])("refuses an invoice that is %j", async (found, code) => {
    tx.invoice.findFirst.mockResolvedValue(found);
    tx.invoice.updateMany.mockResolvedValue({ count: 0 });
    expect(await run()).toEqual({ status: "error", code });
  });

  it("remembers what the chef confirmed after the commit, and a memory failure changes nothing", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({}), line({ id: "l1", position: 1, action: "ignore", productId: null })]);
    memory.rememberSupplierItems.mockRejectedValue(new Error("boom"));
    expect(await run()).toMatchObject({ status: "applied", updated: 1 });
    expect(memory.rememberSupplierItems).toHaveBeenCalledWith("s1", [
      { code: "ZU1", description: "Zucchine", productId: "p1", packQty: null, packUnit: null, priceCents: 180 },
    ]);
  });

  it("without a printed date the price is dated now", async () => {
    tx.invoice.findFirst.mockResolvedValue({ status: "review", supplierId: null, issuedOn: null });
    tx.product.findFirst.mockResolvedValue({ id: "p1", unidadCompra: "kg", precioCompra: 150, precioActualizadoAt: null });
    await run();
    expect(tx.product.update.mock.calls[0]![0].data.precioActualizadoAt).toEqual(NOW);
    expect(memory.rememberSupplierItems).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/apply.test.ts`
Expected: FAIL with `Failed to resolve import "./apply"`.

- [ ] **Step 11: Implement apply**

```ts
// apps/api/lib/invoices/apply.ts
// Applies a reviewed invoice in one transaction: claim review -> applied, refuse undecided
// lines, then write prices, drafts and links. Supplier memory is written after the commit,
// best effort: a cache must never roll back prices.
import { prisma } from "@atelier/db";
import { createDraftProduct } from "../products/drafts";
import { logger } from "../logger";
import { draftUnitFor } from "./pricing";
import { rememberSupplierItems, type MemoryEntry } from "./supplier-memory";

type Skipped = { position: number; reason: "product_deleted" | "newer_price" };
export type ApplyResult =
  | { status: "applied"; updated: number; drafts: number; connected: number; ignored: number; skipped: Skipped[] }
  | { status: "already_applied" }
  | { status: "error"; code: "invoice_not_found" | "invoice_not_in_review" | "lines_undecided"; positions?: number[] };

class Undecided extends Error {
  constructor(readonly positions: number[]) { super("lines_undecided"); }
}

const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

export async function applyInvoice(input: { invoiceId: string; restaurantId: string; userId: string; now?: Date }): Promise<ApplyResult> {
  const now = input.now ?? new Date();
  const { invoiceId, restaurantId, userId } = input;
  const remembered: MemoryEntry[] = [];
  let supplierId: string | null = null;

  let result: ApplyResult;
  try {
    result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, restaurantId, deletedAt: null }, select: { status: true, supplierId: true, issuedOn: true } });
      if (!invoice) return { status: "error", code: "invoice_not_found" } as const;
      const claimed = await tx.invoice.updateMany({ where: { id: invoiceId, status: "review" }, data: { status: "applied", appliedAt: now } });
      if (claimed.count === 0) {
        return invoice.status === "applied" ? ({ status: "already_applied" } as const) : ({ status: "error", code: "invoice_not_in_review" } as const);
      }
      supplierId = invoice.supplierId;

      const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, orderBy: { position: "asc" } });
      const undecided = lines.filter((l) => l.action === null).map((l) => l.position);
      if (undecided.length > 0) throw new Undecided(undecided);

      // The invoice's own day at noon UTC: the same calendar day in every European time zone (minor #5).
      const priceAt = invoice.issuedOn ? new Date(`${invoice.issuedOn.toISOString().slice(0, 10)}T12:00:00Z`) : now;
      const counts = { updated: 0, drafts: 0, connected: 0, ignored: 0 };
      const skipped: Skipped[] = [];

      for (const line of lines) {
        const taxRatePct = num(line.taxRatePct);
        const memory = (productId: string) =>
          remembered.push({ code: line.code, description: line.description, productId, packQty: num(line.packQty), packUnit: line.packUnit, priceCents: line.appliedPriceCents });

        if (line.action === "ignore") { counts.ignored++; continue; }

        if (line.action === "create_draft") {
          const unit = draftUnitFor({ unit: line.unit, packQty: num(line.packQty), packUnit: line.packUnit });
          const created = await createDraftProduct(tx, {
            restaurantId, name: line.description, ...(unit ? { unidadCompra: unit } : {}),
            precioCompra: line.appliedPriceCents ?? 0, taxRatePct, precioActualizadoAt: priceAt,
          });
          await tx.invoiceLine.update({ where: { id: line.id }, data: { productId: created.id } });
          if (line.appliedPriceCents !== null && unit) {
            await tx.productPriceHistory.create({ data: { productId: created.id, authorId: userId, precio: line.appliedPriceCents, unidadCompra: unit, invoiceLineId: line.id } });
          }
          memory(created.id);
          counts.drafts++;
          continue;
        }

        const product = line.productId
          ? await tx.product.findFirst({ where: { id: line.productId, restaurantId, deletedAt: null }, select: { id: true, unidadCompra: true, precioCompra: true, precioActualizadoAt: true } })
          : null;
        if (!product) { skipped.push({ position: line.position, reason: "product_deleted" }); continue; }

        if (line.action === "connect") { memory(product.id); counts.connected++; continue; }

        // update_price. A price set from a newer invoice (or by hand later) stays.
        if (product.precioCompra > 0 && product.precioActualizadoAt && product.precioActualizadoAt > priceAt) {
          skipped.push({ position: line.position, reason: "newer_price" });
          continue;
        }
        const price = line.appliedPriceCents!;
        await tx.product.update({
          where: { id: product.id },
          data: { precioCompra: price, precioActualizadoAt: priceAt, ...(taxRatePct !== null ? { taxRatePct } : {}) },
        });
        await tx.productPriceHistory.create({ data: { productId: product.id, authorId: userId, precio: price, unidadCompra: product.unidadCompra, invoiceLineId: line.id } });
        memory(product.id);
        counts.updated++;
      }
      return { status: "applied", ...counts, skipped } as const;
    });
  } catch (error) {
    if (error instanceof Undecided) return { status: "error", code: "lines_undecided", positions: error.positions };
    throw error;
  }

  if (result.status === "applied" && supplierId && remembered.length > 0) {
    try {
      await rememberSupplierItems(supplierId, remembered);
    } catch (error) {
      logger.warn("invoice_memory_failed", { invoiceId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (result.status === "applied") logger.info("invoice_applied", { invoiceId, ...result, skipped: result.skipped.length });
  return result;
}
```

`update_price` always has a price at this point: PATCH (Task 13) refuses `update_price` without one, and `proposeInvoiceLines` only pre-selects it with a price.

In the "a draft without a price gets no history row" case, `unit: null` makes `draftUnitFor` return `null`. So no `unidadCompra` is passed, and the draft takes the default unit for its name.

- [ ] **Step 12: Run it to verify it passes**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/apply.test.ts`
Expected: PASS.

- [ ] **Step 13: Write the failing route test**

```ts
// apps/api/app/api/invoices/__tests__/apply-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { guard, apply } = vi.hoisted(() => ({ guard: { requireAuth: vi.fn() }, apply: { applyInvoice: vi.fn() } }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/invoices/apply", () => apply);
import { POST } from "../[id]/apply/route";

const call = () => POST(new NextRequest("https://t.local/x", { method: "POST" }), { params: Promise.resolve({ id: "inv1" }) });
beforeEach(() => { vi.clearAllMocks(); guard.requireAuth.mockResolvedValue({ userId: "u1", role: "admin", restaurantId: "r1" }); });

describe("POST /api/invoices/[id]/apply", () => {
  it("applies for the caller's restaurant", async () => {
    apply.applyInvoice.mockResolvedValue({ status: "applied", updated: 2, drafts: 1, connected: 0, ignored: 1, skipped: [] });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2, drafts: 1, connected: 0, ignored: 1, skipped: [] });
    expect(apply.applyInvoice).toHaveBeenCalledWith({ invoiceId: "inv1", restaurantId: "r1", userId: "u1" });
    expect(guard.requireAuth).toHaveBeenCalledWith(expect.anything(), "manage_products");
  });

  it("a repeated apply is a quiet success", async () => {
    apply.applyInvoice.mockResolvedValue({ status: "already_applied" });
    expect(await (await call()).json()).toEqual({ alreadyApplied: true });
  });

  it.each([
    [{ status: "error", code: "invoice_not_found" }, 404],
    [{ status: "error", code: "invoice_not_in_review" }, 409],
    [{ status: "error", code: "lines_undecided", positions: [3] }, 409],
  ])("maps %j to %i", async (result, status) => {
    apply.applyInvoice.mockResolvedValue(result);
    const res = await call();
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ code: result.code });
  });
});
```

- [ ] **Step 14: Implement the route**

```ts
// apps/api/app/api/invoices/[id]/apply/route.ts
// Applies a reviewed invoice: prices, drafts and links in one transaction. Idempotent: a second
// call returns alreadyApplied.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { applyInvoice } from "@/lib/invoices/apply";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;
  const result = await applyInvoice({ invoiceId: id, restaurantId: ctx.restaurantId, userId: ctx.userId });
  if (result.status === "already_applied") return NextResponse.json({ alreadyApplied: true });
  if (result.status === "error") {
    return NextResponse.json(
      { error: result.code, code: result.code, ...(result.positions ? { positions: result.positions } : {}) },
      { status: result.code === "invoice_not_found" ? 404 : 409 },
    );
  }
  const { status: _status, ...counts } = result;
  return NextResponse.json(counts);
}
```

- [ ] **Step 15: Run every touched test and typecheck**

Run: `cd apps/api && pnpm exec vitest run lib/invoices lib/products app/api/invoices && pnpm exec tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 16: Commit**

```bash
git add apps/api/lib/products/drafts.ts apps/api/lib/products/drafts.test.ts apps/api/lib/products/recipe-save.ts apps/api/lib/invoices/supplier-memory.ts apps/api/lib/invoices/supplier-memory.test.ts apps/api/lib/invoices/apply.ts apps/api/lib/invoices/apply.test.ts "apps/api/app/api/invoices/[id]/apply" apps/api/app/api/invoices/__tests__/apply-route.test.ts
git commit -m "feat(invoices): apply a reviewed invoice once, with drafts, history and supplier memory"
```

---

### Task 15: Purge deleted and abandoned invoices with their files

These are purged for good:
- invoices in the trash for more than 7 days, the same retention as the rest of the trash;
- uploads abandoned for more than 24 hours (still `uploading`).

Their files are deleted after the database commit. Deleting a restaurant (account deletion case C, or the last member leaving) also deletes every invoice file under `invoices/<restaurantId>/`. The database rows already cascade from `Restaurant`.

Invoices get their own purge function, called by the same daily cron, instead of a new stage inside `purgeExpiredTrash`. That keeps `TrashPurgeCounts` and its strict in-memory test harness unchanged.

**Files:**
- Modify: `apps/api/lib/invoices/storage.ts` (add `deleteRestaurantInvoiceFiles`)
- Modify: `apps/api/lib/invoices/storage.test.ts`
- Create: `apps/api/lib/invoices/purge.ts`
- Test: `apps/api/lib/invoices/purge.test.ts`
- Modify: `apps/api/app/api/cron/purge-trash/route.ts`
- Modify: `apps/api/app/api/cron/purge-trash/route.test.ts`
- Modify: `apps/api/app/api/me/route.ts` (around line 309, after `deleteBlobs`)
- Modify: `apps/api/app/api/me/__tests__/delete.test.ts`
- Modify: `apps/api/app/api/restaurant/leave/route.ts` (around line 191, after `deleteBlobs`)
- Modify: `apps/api/app/api/restaurant/leave/__tests__/leave.test.ts`

**Interfaces:**
- Consumes: `TRASH_RETENTION_DAYS` (`apps/api/lib/trash-purge.ts`); `deleteInvoiceFiles` (Task 8).
- Produces:
  - `deleteRestaurantInvoiceFiles(restaurantId: string): Promise<void>`, which never throws.
  - `ABANDONED_UPLOAD_MS = 24 * 60 * 60 * 1000`
  - `type InvoicePurgeResult = { invoices: number; files: number; failed: number; complete: boolean }`
  - `purgeExpiredInvoices(now: Date, opts?: { batchSize?: number; budgetMs?: number }): Promise<InvoicePurgeResult>`
  - The cron returns `{ ...trashResult, invoices: InvoicePurgeResult | null }`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/lib/invoices/storage.test.ts`:
- `list: vi.fn()` in the hoisted `blob` mock;
- `deleteRestaurantInvoiceFiles` in the import;
- this describe:

```ts
describe("deleteRestaurantInvoiceFiles", () => {
  it("deletes every page under the restaurant's prefix, page by page", async () => {
    blob.list
      .mockResolvedValueOnce({ blobs: [{ pathname: "invoices/r1/a/1.jpg" }], hasMore: true, cursor: "c1" })
      .mockResolvedValueOnce({ blobs: [{ pathname: "invoices/r1/b/2.pdf" }], hasMore: false });
    await deleteRestaurantInvoiceFiles("r1");
    expect(blob.list).toHaveBeenNthCalledWith(1, expect.objectContaining({ prefix: "invoices/r1/", cursor: undefined }));
    expect(blob.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ prefix: "invoices/r1/", cursor: "c1" }));
    expect(blob.del.mock.calls.map((c) => c[0])).toEqual([["invoices/r1/a/1.jpg"], ["invoices/r1/b/2.pdf"]]);
  });

  it("never throws, not even without a token", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await expect(deleteRestaurantInvoiceFiles("r1")).resolves.toBeUndefined();
    blob.list.mockRejectedValue(new Error("down"));
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "shared");
    await expect(deleteRestaurantInvoiceFiles("r1")).resolves.toBeUndefined();
  });
});
```

```ts
// apps/api/lib/invoices/purge.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, tx, storage } = vi.hoisted(() => {
  const tx = { invoicePage: { findMany: vi.fn() }, invoice: { deleteMany: vi.fn() } };
  return {
    tx,
    db: { invoice: { findMany: vi.fn() }, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) },
    storage: { deleteInvoiceFiles: vi.fn() },
  };
});
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("./storage", () => storage);
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { purgeExpiredInvoices } from "./purge";

const now = new Date("2026-10-15T03:30:00Z");
const expired = {
  OR: [
    { deletedAt: { lt: new Date("2026-10-08T03:30:00Z") } },
    { status: "uploading", deletedAt: null, createdAt: { lt: new Date("2026-10-14T03:30:00Z") } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.invoicePage.findMany.mockResolvedValue([{ storageKey: "k1" }, { storageKey: "k2" }]);
  tx.invoice.deleteMany.mockResolvedValue({ count: 2 });
});

describe("purgeExpiredInvoices", () => {
  it("deletes trashed and abandoned invoices, then their files", async () => {
    db.invoice.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    expect(await purgeExpiredInvoices(now, { batchSize: 10 })).toEqual({ invoices: 2, files: 2, failed: 0, complete: true });
    expect(db.invoice.findMany).toHaveBeenCalledWith({ where: expired, select: { id: true }, orderBy: { createdAt: "asc" }, take: 10 });
    expect(tx.invoicePage.findMany).toHaveBeenCalledWith({ where: { invoice: { id: { in: ["a", "b"] }, ...expired } }, select: { storageKey: true } });
    expect(tx.invoice.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] }, ...expired } });
    expect(storage.deleteInvoiceFiles).toHaveBeenCalledWith(["k1", "k2"]);
  });

  it("files are not touched when the delete fails, and the batch is skipped", async () => {
    db.invoice.findMany.mockResolvedValueOnce([{ id: "a" }]).mockResolvedValueOnce([]);
    tx.invoice.deleteMany.mockRejectedValue(new Error("fk"));
    expect(await purgeExpiredInvoices(now, { batchSize: 1 })).toMatchObject({ invoices: 0, failed: 1 });
    expect(storage.deleteInvoiceFiles).not.toHaveBeenCalled();
    expect(db.invoice.findMany.mock.calls[1]![0].where).toEqual({ ...expired, id: { notIn: ["a"] } });
  });

  it("stops when out of time", async () => {
    expect(await purgeExpiredInvoices(now, { budgetMs: -1 })).toMatchObject({ complete: false, invoices: 0 });
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });
});
```

In `apps/api/app/api/cron/purge-trash/route.test.ts`:
- mock the new module: `vi.mock("@/lib/invoices/purge", () => ({ purgeExpiredInvoices }))`, with `purgeExpiredInvoices: vi.fn()` added to the hoisted object;
- give it a result in `beforeEach`: `purgeExpiredInvoices.mockResolvedValue({ invoices: 1, files: 2, failed: 0, complete: true })`;
- change the success expectation to `toEqual({ ...counts, invoices: { invoices: 1, files: 2, failed: 0, complete: true } })`;
- add one case:

```ts
  it("an invoice purge crash still returns the trash result", async () => {
    purgeExpiredInvoices.mockRejectedValue(new Error("blob down"));
    const response = await GET(authorized());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...counts, invoices: null });
  });
```

`authorized()` stands for however the existing success case builds its authorized request (read lines 33-41 of that test and reuse it).

In `apps/api/app/api/me/__tests__/delete.test.ts`:
- add `const deleteRestaurantInvoiceFiles = vi.fn();` and `vi.mock("@/lib/invoices/storage", () => ({ deleteRestaurantInvoiceFiles }));`;
- in the existing "case C deletes the restaurant pipeline and then the user" test, add `expect(deleteRestaurantInvoiceFiles).toHaveBeenCalledWith("r1");`;
- in the case-A test that ends at line 312, add `expect(deleteRestaurantInvoiceFiles).not.toHaveBeenCalled();`.

In `apps/api/app/api/restaurant/leave/__tests__/leave.test.ts`, mock the same module the same way. In the test where the restaurant is deleted (case C), expect `deleteRestaurantInvoiceFiles` to have been called with that test's restaurant id. In a non-deleting case, expect it not to be called.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && pnpm exec vitest run lib/invoices/storage.test.ts lib/invoices/purge.test.ts app/api/cron/purge-trash app/api/me/__tests__/delete.test.ts app/api/restaurant/leave`
Expected: FAIL. `deleteRestaurantInvoiceFiles` is not exported, `./purge` does not resolve, the cron body lacks `invoices`, and the account and leave routes never call the mock.

- [ ] **Step 3: Implement**

Add to `apps/api/lib/invoices/storage.ts`. Import `list` with the other `@vercel/blob` imports.

```ts
// Every invoice file of a restaurant that is being deleted. Its rows cascade from Restaurant;
// the files are found by their key prefix. Never throws: account deletion must finish.
export async function deleteRestaurantInvoiceFiles(restaurantId: string): Promise<void> {
  try {
    const auth = token();
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `invoices/${restaurantId}/`, cursor, token: auth });
      if (page.blobs.length > 0) await del(page.blobs.map((b) => b.pathname), { token: auth });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (error) {
    logger.warn("invoice_storage_restaurant_delete_failed", { restaurantId, message: message(error) });
  }
}
```

```ts
// apps/api/lib/invoices/purge.ts
// Daily, from /api/cron/purge-trash: deletes for good the invoices in the trash for more than
// TRASH_RETENTION_DAYS and the uploads abandoned for a day, then their private files.
// Files go only after the rows are gone, so a failed delete never leaves an invoice without pages.
import { prisma } from "@atelier/db";
import { logger } from "../logger";
import { TRASH_RETENTION_DAYS } from "../trash-purge";
import { deleteInvoiceFiles } from "./storage";

export const ABANDONED_UPLOAD_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type InvoicePurgeResult = { invoices: number; files: number; failed: number; complete: boolean };

export async function purgeExpiredInvoices(now: Date, opts: { batchSize?: number; budgetMs?: number } = {}): Promise<InvoicePurgeResult> {
  const batchSize = opts.batchSize ?? 200;
  const deadline = Date.now() + (opts.budgetMs ?? 30_000);
  const expired = {
    OR: [
      { deletedAt: { lt: new Date(+now - TRASH_RETENTION_DAYS * DAY_MS) } },
      { status: "uploading" as const, deletedAt: null, createdAt: { lt: new Date(+now - ABANDONED_UPLOAD_MS) } },
    ],
  };
  const result: InvoicePurgeResult = { invoices: 0, files: 0, failed: 0, complete: false };
  const skipped: string[] = [];

  for (;;) {
    if (Date.now() >= deadline) break;
    const ids = (await prisma.invoice.findMany({
      where: skipped.length ? { ...expired, id: { notIn: skipped } } : expired,
      select: { id: true }, orderBy: { createdAt: "asc" }, take: batchSize,
    })).map((row) => row.id);
    if (ids.length === 0) { result.complete = true; break; }
    try {
      const removed = await prisma.$transaction(async (tx) => {
        const pages = await tx.invoicePage.findMany({ where: { invoice: { id: { in: ids }, ...expired } }, select: { storageKey: true } });
        const { count } = await tx.invoice.deleteMany({ where: { id: { in: ids }, ...expired } });
        return { count, keys: pages.map((p) => p.storageKey) };
      });
      result.invoices += removed.count;
      result.files += removed.keys.length;
      await deleteInvoiceFiles(removed.keys);
    } catch (error) {
      skipped.push(...ids);
      result.failed += ids.length;
      logger.error("invoice_purge_batch_failed", { size: ids.length, message: error instanceof Error ? error.message : String(error) });
    }
    if (ids.length < batchSize) { result.complete = true; break; }
  }
  logger.info("invoice_purge_finished", result);
  return result;
}
```

The "files are not touched" test uses `batchSize: 1`. After the failed batch of one, `findMany` runs again (because `ids.length === batchSize`) and returns `[]`. That is the second call whose `where` the test checks.

In `apps/api/app/api/cron/purge-trash/route.ts`, replace the body of the `try`:

```ts
    const now = new Date();
    // Invoices first, with their own 30 s budget, so the trash keeps its 240 s within maxDuration.
    const invoices = await purgeExpiredInvoices(now).catch((error) => {
      logger.error("invoice_purge_crashed", { message: error instanceof Error ? error.message : String(error) });
      return null;
    });
    return NextResponse.json({ ...(await purgeExpiredTrash(now)), invoices });
```

Add `import { purgeExpiredInvoices } from "@/lib/invoices/purge";`. The existing test checks that `purgeExpiredTrash` got the request time (`started`): keep passing that same `now`.

In `apps/api/app/api/me/route.ts`, after the `await deleteBlobs([...])` call:

```ts
  if (expectedCase === "C" && expectedRestaurantId) await deleteRestaurantInvoiceFiles(expectedRestaurantId);
```

In `apps/api/app/api/restaurant/leave/route.ts`, after its `await deleteBlobs([...])`:

```ts
  await deleteRestaurantInvoiceFiles(restaurantId);
```

Both routes get `import { deleteRestaurantInvoiceFiles } from "@/lib/invoices/storage";`. Before writing the `me` line, read the names in that file around lines 181 and 309 (`expectedCase`, `expectedRestaurantId`). Use the variables that hold the case and the restaurant id confirmed before the transaction.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/api && pnpm exec vitest run lib/invoices app/api/cron app/api/me app/api/restaurant/leave lib/trash-purge.test.ts && pnpm exec tsc --noEmit`
Expected: PASS. `trash-purge.test.ts` is unchanged and still green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/invoices/storage.ts apps/api/lib/invoices/storage.test.ts apps/api/lib/invoices/purge.ts apps/api/lib/invoices/purge.test.ts apps/api/app/api/cron/purge-trash apps/api/app/api/me/route.ts apps/api/app/api/me/__tests__/delete.test.ts apps/api/app/api/restaurant/leave/route.ts apps/api/app/api/restaurant/leave/__tests__/leave.test.ts
git commit -m "feat(invoices): purge deleted and abandoned invoices and their private files"
```

---

### Task 16: Price history links back to its invoice

The spec's "Connections" section says a price that came from an invoice opens that invoice from the product's history. The history route returns the invoice id; Plan 3 draws the link.

**Files:**
- Modify: `apps/api/app/api/products/[id]/history/route.ts:32-54`
- Test: `apps/api/app/api/products/[id]/history/__tests__/history.test.ts` (create; the route has no test yet)

**Interfaces:**
- Produces: each `priceHistory` row adds `invoiceId: string | null`. Every other field is unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/app/api/products/[id]/history/__tests__/history.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { db, guard } = vi.hoisted(() => ({
  db: { product: { findUnique: vi.fn(), findFirst: vi.fn() }, productPriceHistory: { findMany: vi.fn() }, yieldTest: { findMany: vi.fn() } },
  guard: { requireAuth: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue({ userId: "u1", role: "admin", restaurantId: "r1" });
  const product = { id: "p1", restaurantId: "r1", deletedAt: null };
  db.product.findUnique.mockResolvedValue(product);
  db.product.findFirst.mockResolvedValue(product);
  db.yieldTest.findMany.mockResolvedValue([]);
  db.productPriceHistory.findMany.mockResolvedValue([
    { id: "h1", precio: 180, unidadCompra: "kg", createdAt: new Date("2026-10-15T09:00:00Z"), author: null, invoiceLine: { invoiceId: "inv1" } },
    { id: "h2", precio: 150, unidadCompra: "kg", createdAt: new Date("2026-10-01T09:00:00Z"), author: { id: "u1", name: "Andy" }, invoiceLine: null },
  ]);
});

describe("GET /api/products/[id]/history", () => {
  it("each price says which invoice it came from, if any", async () => {
    const body = await (await GET(new NextRequest("https://t.local/x"), { params: Promise.resolve({ id: "p1" }) })).json();
    expect(body.priceHistory).toEqual([
      { id: "h1", precio: 180, unidadCompra: "kg", createdAt: "2026-10-15T09:00:00.000Z", author: null, invoiceId: "inv1" },
      { id: "h2", precio: 150, unidadCompra: "kg", createdAt: "2026-10-01T09:00:00.000Z", author: { id: "u1", name: "Andy" }, invoiceId: null },
    ]);
  });
});
```

Before running, read lines 1-30 of the route to see how it loads the product (`findUnique` or `findFirst`) and which auth helper it uses (`requireAuth` or another). Mock exactly those. The mock above covers both product lookups.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec vitest run "app/api/products/[id]/history"`
Expected: FAIL. The rows have no `invoiceId`.

- [ ] **Step 3: Implement.**

In the `productPriceHistory.findMany` call, change `include` to:

```ts
      include: { author: { select: { id: true, name: true } }, invoiceLine: { select: { invoiceId: true } } },
```

In the mapping, add `invoiceId: row.invoiceLine?.invoiceId ?? null,` after `author: row.author,`.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && pnpm exec vitest run "app/api/products/[id]/history" && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/api/app/api/products/[id]/history"
git commit -m "feat(products): price history links each invoice price to its invoice"
```

---

### Task 17: Real-invoice gate again, dev apply run, full suites

This repeats the Plan 1 gate on the same 8 photos with the Plan 2 reading. It checks that G1–G7 are fixed on paper, not only in unit tests. The photos stay in the session scratchpad; they are never committed (VAT numbers and IBANs).

**Files:**
- Modify: `apps/api/scripts/invoice-spike.ts` (Plan 1 Task 2). It already calls `checkInvoiceTotals` (Task 4). Add the merged per-document view: pages of one document passed together to `mergeInvoicePages`.
- Modify: `odd/tasks/supplier-invoice-scanner.md` (log the result)

- [ ] **Step 1: Group pages by document in the spike script.** The script takes file paths. Add a `--doc` separator, so `a.jpg b.jpg --doc c.jpg` reads `a+b` as one invoice and `c` as another. For each document, print:
  - the merged header;
  - each line as `kind | description | qty unit | pack | unit price | tax | total`;
  - the `checkInvoiceTotals` result.

```ts
// in apps/api/scripts/invoice-spike.ts, replacing the per-page loop's report
const docs: string[][] = [[]];
for (const arg of files) {
  if (arg === "--doc") docs.push([]);
  else docs[docs.length - 1]!.push(arg);
}
for (const doc of docs.filter((d) => d.length > 0)) {
  const pages = [];
  for (const file of doc) pages.push(await extractInvoicePage(readFileSync(file), mimeFor(file)));
  const merged = mergeInvoicePages(pages);
  const totals = checkInvoiceTotals(merged.lines, merged.header);
  report.push({ files: doc, header: merged.header, lines: merged.lines, droppedLines: merged.droppedLines, totals });
  console.log(`\n== ${doc.join(" + ")} — ${merged.header.supplierName ?? "?"} #${merged.header.invoiceNumber ?? "?"} — totals ${totals.status} (${totals.diffCents ?? "-"})`);
  for (const l of merged.lines) {
    console.log(`  ${l.kind} | ${l.description} | ${l.quantity ?? "-"} ${l.unit ?? ""} | pack ${l.packQty ?? "-"} ${l.packUnit ?? ""} | ${l.unitPriceCents ?? "-"} | ${l.taxRatePct ?? "-"}% | ${l.lineTotalCents ?? "-"}`);
  }
}
```

Keep the script's existing names (`files`, `report`, `mimeFor`, how it loads `.env.local`). Read it first and adapt the variable names to what is there.

- [ ] **Step 2: Run the gate.** The Scelgo pages go together as one document. Use the order from Plan 1's run (L7): photos 1–8 in the scratchpad `invoices/` folder, with Scelgo on two consecutive files.

Run: `cd apps/api && ../../packages/db/node_modules/.bin/tsx scripts/invoice-spike.ts <scratchpad>/invoices/1.jpg --doc <...> > <scratchpad>/invoice-gate-2.txt`
Expected, per finding (record each one as met or not met):

| Finding | Expected |
|---|---|
| G1 | No document fails. A transient 400 shows as `invoice_extraction_retry` or `ai_provider_http_error` in the log, not as a failure. |
| G2 | No line is a scientific name, an FAO zone or "VENDITA MERCE". The crate deposit is a `charge`. |
| G3 | "kg 1,75 - pz24", "G 1100 X 4" and "Kili: 4,000" end up in `packQty`/`packUnit`, not only in the description. |
| G4 | Scelgo is one document: lines from page 1, totals from page 2, totals `ok` or `mismatch`, not `unknown`. |
| G5 | Recchioni and DAC show `netTotalCents: null` when only the gross is printed. Their totals are checked against the gross. |
| G6 | Garden Fruit lines carry tax 4. The NR line keeps its unit (not KG). The fagiolini quantity is 2.58. G6 depends on the model, so a miss is recorded, not fixed by code. |
| G7 | A header line no longer turns the totals `unknown`. |

- [ ] **Step 3: Apply smoke on the dev database.**

Load `DATABASE_URL` from `apps/api/.env.local` without printing it, and confirm the host is `ep-summer-heart` (dev). Then run a script in the scratchpad (never committed) that:
1. picks the dev restaurant used for testing;
2. creates an invoice in `review` with two lines: one `update_price` on an existing product, one `create_draft`;
3. calls `applyInvoice` twice;
4. checks that the first call is `applied`, the second is `already_applied`, and there is one history row per priced line and one draft;
5. deletes what it created.

Expected: the result described above, on real PostgreSQL (the spec's "apply on real PostgreSQL" test). Never run it against production.

- [ ] **Step 4: Full suites and typecheck**

Run: `pnpm --filter @atelier/api exec vitest run > <scratchpad>/api.txt; tail -5 <scratchpad>/api.txt`
Run: `pnpm --filter @atelier/shared exec vitest run | tail -5`
Run: `pnpm typecheck`
Expected: all green, and no type errors. Mobile is untouched by this plan, so its suite is not required. Run it anyway if `packages/shared` changed in a way it imports.

- [ ] **Step 5: Log and commit.** Append an entry to `odd/tasks/supplier-invoice-scanner.md` `## Log`, with:
- G1–G7 met or not met;
- the dev apply result;
- the suite counts.

```bash
git add apps/api/scripts/invoice-spike.ts odd/tasks/supplier-invoice-scanner.md
git commit -m "docs(odd): record plan 2 gate on real invoices and dev apply run"
```

Then run the final independent review of the whole branch (user's standing choice). Give it this plan's Review Focus.

---
