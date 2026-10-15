# Supplier Invoice Scanner — Plan 3 (Mobile App) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The chef scans a supplier invoice from the phone (camera, gallery or PDF), reviews the lines Atelier read, decides each one and applies it to the product bank — plus the small API pieces those screens need.

**Architecture:** Four API tasks close the gaps the screens hit (product tax in the bank, header correction, a 4 MB upload limit under Vercel's 4.5 MB body cap, storage and "ignore" hardening). The app gets a thin invoice client over `apiFetch` and `FileSystem.uploadAsync`, pure helpers (image preparation, upload orchestration, view rules) tested on their own, a focus-aware polling hook, and three screens under `app/facturas/` (list, scanner, invoice) built from small components in `src/components/invoices/`. The product detail screen learns the tax rate and links price-history rows to their invoice.

**Tech Stack:** Expo 56 / React Native 0.85 / expo-router 56 (typed routes), `expo-file-system/legacy`, `expo-image-picker`, `expo-document-picker`, `expo-sharing`, new `expo-image-manipulator`; Next.js 15 API + Prisma (`@atelier/db`); zod contracts in `@atelier/shared`; copy in `@atelier/i18n` (es, it, en); vitest everywhere (mobile: node env + `react-test-renderer`).

**Spec:** `docs/superpowers/specs/2026-10-14-supplier-invoice-scanner-design.md` (screens: lines 75-86). Plan 2 (API, done): `docs/superpowers/plans/2026-10-15-supplier-invoice-scanner-plan-2.md`. Feature log: `odd/tasks/supplier-invoice-scanner.md` (L9-L12).

## Global Constraints

- Branch: `feat/supplier-invoice-scanner`. Commits: Conventional Commits, no AI attribution lines.
- Every UI string goes through `@atelier/i18n`; every new key exists in `packages/i18n/src/es.ts`, `it.ts` and `en.ts` (keys are typed from `es.ts`; a missing key breaks `pnpm typecheck`). Append new keys at the end of each object, after `toast_offline_stale`. Spanish copy uses "tú", like the rest of the app.
- Mobile imports from `react-native` are named imports only (a test forbids `import * as`).
- Uploads use `FileSystem.uploadAsync` from `expo-file-system/legacy` (multipart, `fieldName: "file"`, manual `Authorization: Bearer` header). `fetch` + `FormData` fails in standalone builds.
- Mobile tests: `apps/mobile/src/**/__tests__/**/*.test.ts` only (`.ts`, not `.tsx`), `createElement` + `react-test-renderer`; `react-native` and child components are mocked as string host components.
- Only roles with `manage_products` see or open invoices (the API already refuses the rest).
- Every invoice file the app sends is at most 4 MB (Vercel refuses request bodies over 4.5 MB before the route runs).
- Invoice photos and PDFs are business data: tests use fake bytes; never commit a real invoice.
- No database migration in this plan. Never touch the production database.
- `expo-image-manipulator` and the new permission text need a new native build before device testing (Task 16).

## Review Focus

1. **An iPhone gallery photo in HEIC, or a 12 MP camera photo** — the app must turn it into a JPEG under 3.5 MB and the server must accept it; never a "file too large" or "unsupported type" for an ordinary photo. Pinned in Task 6 ("re-encodes a HEIC portrait photo as JPEG…", "a photo still too heavy gets a second, smaller pass").
2. **Leaving the invoice screen while it is being read, or locking the phone** — polling must stop (no requests from a screen nobody sees, none after unmount) and resume with a fresh read when the app comes back. Pinned in Task 9.
3. **The connection drops halfway through a three-page upload** — the half-sent invoice must not linger as "uploading", and the pages the chef photographed must stay on screen to resend. Pinned in Task 7 ("a page that fails to upload deletes the half-sent invoice") and Task 11 ("keeps what was not sent…").
4. **Apply pressed twice, or applied meanwhile from another phone** — exactly one apply request; an already-applied invoice shows a calm message, not an error. Pinned in Task 14 ("a second press while applying sends nothing", "an invoice applied from another phone says so").
5. **The chef picks a product whose unit cannot take the invoice's price** — choosing the product still works (the line is linked without a price) instead of failing with "Enter a price". Pinned in Task 5 ("chooseProduct falls back to linking when no price fits").

## Rulings

- **Scope.** API pieces in this plan: product `taxRatePct` in the bank (minor #12 folds in: the bank's real cost includes tax, like recipe cost), `PATCH /api/invoices/[id]` header correction, the 4 MB limit with code `file_too_large`, removal of an orphan file when the first page row fails, `openInvoiceFile` wrapping storage errors (503 from the page route), and "ignore" keeping product and price so it can be undone.
- **Deferred minors (stay in the L10 list, not in this plan):** a line PATCH racing an apply, retry quota charged to the original uploader, "same day" calendar vs noon UTC, the detail-line merge guard, a priced draft without unit getting no history row.
- **Compression.** Photos are re-encoded as JPEG with the long side at most 2400 px at quality 0.7; if the result is over 3.5 MB, a second pass at 1800 px and 0.5; still over → refused with a clear message. PDFs cannot be shrunk on the phone: over 4 MB they are refused before sending.
- **Supplier picker.** Existing suppliers come from `GET /api/invoices` (suppliers that already have an invoice); no new suppliers endpoint. Changing the supplier after the read does not re-run matching; supplier memory is written under the corrected supplier on apply.
- **Applied invoice.** Shows what was decided per line. Skipped lines (product deleted, newer price) are only known from the apply response, so they show in the result summary right after applying.
- **Line card** shows the product name only (the line view contract carries no product attributes).
- **Polling** every 4 s, only while the screen is focused, the app is in the foreground and an invoice is reading.
- **PDF original** is downloaded with the session token into the app cache and opened through the share sheet; the copy stays in the cache (deleting it right after `shareAsync` breaks Android viewers).
- **Product detail screen** is too heavy to render in a unit test: its new logic lives in `src/lib/product-cost.ts` (tested) and the rest is on the device checklist.

## File Map

API (`apps/api`, `packages/shared`):
- Modify `packages/shared/src/api-contract.ts` — product tax in schemas; invoice error codes.
- Modify `packages/shared/src/invoices-contract.ts` — `invoiceHeaderPatchSchema`, `InvoiceHeaderPatch`.
- Modify `apps/api/lib/products/projections.ts`, `app/api/products/route.ts`, `app/api/products/[id]/route.ts` — tax.
- Create `apps/api/lib/invoices/header.ts` — `plausibleDate`, `upsertSupplier` (moved from `read-invoice.ts`).
- Modify `apps/api/app/api/invoices/[id]/route.ts` — `PATCH`.
- Modify `apps/api/lib/invoices/upload.ts`, `app/api/invoices/route.ts` — 4 MB, orphan cleanup.
- Modify `apps/api/lib/invoices/storage.ts`, `app/api/invoices/[id]/pages/[position]/route.ts`, `app/api/invoices/[id]/lines/[position]/route.ts`.

Mobile (`apps/mobile`):
- Create `src/api/invoices.ts` — HTTP client.
- Create `src/lib/invoice-image.ts`, `src/lib/invoice-upload.ts`, `src/lib/invoice-view.ts`, `src/lib/invoice-original.ts`, `src/lib/product-cost.ts`.
- Create `src/hooks/usePolling.ts`.
- Create `src/components/invoices/InvoiceLineCard.tsx`, `ProductPickerSheet.tsx`, `InvoiceHeaderSheet.tsx`, `InvoiceOriginalSheet.tsx`.
- Create `app/facturas/index.tsx`, `app/facturas/escanear.tsx`, `app/facturas/[id].tsx`.
- Modify `app/(tabs)/casa.tsx`, `app/productos/[id].tsx`, `src/api/products.ts`, `src/lib/api-error.ts`, `app.json`, `package.json`.
- Modify `packages/i18n/src/{es,it,en}.ts` in the tasks that add copy.

---

### Task 1: Product tax rate in the bank

**Files:**
- Modify: `packages/shared/src/api-contract.ts` (schemas near `gramosPorLitroSchema`, `CreateProductRequestSchema`, `PatchProductRequestSchema`, `ProductListItemSchema`)
- Modify: `apps/api/lib/products/projections.ts:17-70`
- Modify: `apps/api/app/api/products/route.ts:96` (list `select`) and `:174-200` (create)
- Modify: `apps/api/app/api/products/[id]/route.ts:152-175` (PATCH data)
- Test: `apps/api/lib/products/projections.test.ts`, `apps/api/app/api/products/__tests__/create.test.ts`, `apps/api/app/api/products/[id]/__tests__/patch.test.ts`

**Interfaces:**
- Produces: `ProductListItem.taxRatePct?: number` (and so `ProductDetail`), `CreateProductRequest.taxRatePct?: number`, `PatchProductRequest.taxRatePct?: number` (0–100, at most 2 decimals). `realCost` now includes tax: `precioCompra × (1 + tax/100) / (1 − merma/100)`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/lib/products/projections.test.ts`:

```ts
describe("product projection — purchase tax", () => {
  it("exposes the tax rate and counts it in the real cost, like recipe cost does", () => {
    const row = { ...productRow(null), taxRatePct: dec(10), mermaPct: dec(20) } as unknown as DetailSource;
    const item = projectProductListItem(row);
    expect(item.taxRatePct).toBe(10);
    expect(item.realCost).toBeCloseTo((500 * 1.1) / 0.8, 6);
  });

  it("a product without tax keeps its plain real cost", () => {
    const item = projectProductListItem({ ...productRow(null), taxRatePct: dec(0) } as unknown as DetailSource);
    expect(item.taxRatePct).toBe(0);
    expect(item.realCost).toBe(500);
  });
});
```

In `apps/api/app/api/products/__tests__/create.test.ts`, inside the `describe` block that defines `oil`, add:

```ts
    it("stores the declared purchase tax", async () => {
      const res = await create({ ...oil, taxRatePct: 10 });
      expect(res.status).toBe(201);
      expect(db.product.create.mock.calls[0]![0].data.taxRatePct).toBe(10);
    });

    it("without a declared tax the database default applies", async () => {
      await create(oil);
      expect(db.product.create.mock.calls[0]![0].data).not.toHaveProperty("taxRatePct");
    });
```

In `apps/api/app/api/products/[id]/__tests__/patch.test.ts`, add inside the main `describe`:

```ts
  it("updates the purchase tax, and leaves it alone when not sent", async () => {
    await patch({ taxRatePct: 22 });
    expect(db.product.updateMany.mock.calls[0]![0].data.taxRatePct).toBe(22);
    await patch({ name: "Patata" });
    expect(db.product.updateMany.mock.calls[1]![0].data.taxRatePct).toBeUndefined();
  });

  it.each([[150], [-1], [10.555]])("refuses a tax rate of %s", async (taxRatePct) => {
    expect((await patch({ taxRatePct })).status).toBe(400);
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter api exec vitest run lib/products/projections.test.ts app/api/products/__tests__/create.test.ts "app/api/products/[id]/__tests__/patch.test.ts"`
Expected: FAIL — `taxRatePct` is `undefined` in the projection, not written by create/patch, and 150 is not refused.

- [ ] **Step 3: Add the schemas**

In `packages/shared/src/api-contract.ts`, after `gramosPorLitroSchema`:

```ts
// Purchase tax (VAT / IVA) in percent, stored as Decimal(5,2).
const taxRatePctSchema = z
  .number()
  .min(0)
  .max(100)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: "At most 2 decimals",
  });
```

Add `taxRatePct: taxRatePctSchema.optional(),` to `CreateProductRequestSchema` and to `PatchProductRequestSchema` (after `gramosPorLitro`), and to `ProductListItemSchema` (after `gramosPorLitro`):

```ts
  // Purchase tax in percent; optional for older payloads.
  taxRatePct: z.number().min(0).max(100).optional(),
```

- [ ] **Step 4: Project and store it**

`apps/api/lib/products/projections.ts`: add `| "taxRatePct"` to the `Pick<Product, …>` list of `ProductListSource`, then in `projectProductListItem`:

```ts
  const mermaPctNum = Number(p.mermaPct);
  // `== null`: a stale query engine may omit the column (same as gramosPorLitro).
  const taxRatePctNum = p.taxRatePct == null ? 0 : Number(p.taxRatePct);
```

and replace the `realCost` line, adding the field after `gramosPorLitro`:

```ts
    // The purchase tax is part of what the product costs, as in recipe cost (cost.ts withTax).
    realCost: realCost(p.precioCompra * (1 + taxRatePctNum / 100), mermaPctNum),
```

```ts
    taxRatePct: taxRatePctNum,
```

Update the header comment's formula to `precioCompra × (1 + taxRatePct/100) / (1 - mermaPct/100)`.

`apps/api/app/api/products/route.ts`: add `taxRatePct: true,` to the list `select` next to `precioActualizadoAt: true` (line 96), and in the create `data` (after `gramosPorLitro`):

```ts
          ...(body.taxRatePct !== undefined ? { taxRatePct: body.taxRatePct } : {}),
```

`apps/api/app/api/products/[id]/route.ts`, in the `updateMany` `data` after `gramosPorLitro: body.gramosPorLitro,`:

```ts
          // undefined → untouched.
          taxRatePct: body.taxRatePct,
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter api exec vitest run lib/products app/api/products`
Expected: PASS.
Run: `pnpm --filter api exec tsc --noEmit`
Expected: no errors (a missing `taxRatePct: true` in a `select` that feeds `projectProductListItem` shows up here; add it).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/api-contract.ts apps/api/lib/products/projections.ts apps/api/lib/products/projections.test.ts apps/api/app/api/products
git commit -m "feat(products): purchase tax rate in the bank and in its real cost"
```

---

### Task 2: Correct an invoice's header

**Files:**
- Create: `apps/api/lib/invoices/header.ts`
- Modify: `apps/api/lib/invoices/read-invoice.ts:41-70` (move `plausibleDate`, `upsertSupplier` out)
- Modify: `packages/shared/src/invoices-contract.ts` (after `InvoiceLinePatch`)
- Modify: `apps/api/app/api/invoices/[id]/route.ts` (add `PATCH`)
- Test: `apps/api/app/api/invoices/__tests__/header-patch.test.ts`

**Interfaces:**
- Produces: `invoiceHeaderPatchSchema` / `InvoiceHeaderPatch = { supplierId?: string; supplierName?: string; number?: string | null; issuedOn?: string | null }` (`issuedOn` is `YYYY-MM-DD`; never both supplier fields).
- Produces: `PATCH /api/invoices/[id]` → `200 { ok: true }`; `400 invalid_body`; `404 invoice_not_found | supplier_not_found`; `409 invoice_not_in_review`.
- Produces: `plausibleDate(raw: string | null, uploadedAt: Date): string | null` and `upsertSupplier(restaurantId: string, name: string | null, taxId: string | null): Promise<string | null>` from `lib/invoices/header.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/app/api/invoices/__tests__/header-patch.test.ts`:

```ts
// apps/api/app/api/invoices/__tests__/header-patch.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => ({
  db: {
    invoice: { findFirst: vi.fn(), updateMany: vi.fn() },
    supplier: { findFirst: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
  },
  guard: { requireAuth: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/recipes/extraction-pipeline", () => ({ loadMatchCandidates: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { PATCH } from "../[id]/route";

const NOW = new Date("2026-10-15T09:00:00Z");
const patch = (body: unknown, id = "inv1") =>
  PATCH(new NextRequest(`https://t.local/api/invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const written = () => db.invoice.updateMany.mock.calls[0]![0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  guard.requireAuth.mockResolvedValue({ userId: "u1", role: "sous_chef", restaurantId: "r1" });
  db.invoice.findFirst.mockResolvedValue({ status: "review" });
  db.invoice.updateMany.mockResolvedValue({ count: 1 });
  db.supplier.findFirst.mockResolvedValue({ id: "s2" });
  db.supplier.upsert.mockResolvedValue({ id: "s9" });
});
afterEach(() => vi.useRealTimers());

describe("PATCH /api/invoices/[id]", () => {
  it("picks an existing supplier of this restaurant, fenced on review", async () => {
    const res = await patch({ supplierId: "s2" });
    expect(res.status).toBe(200);
    expect(db.supplier.findFirst).toHaveBeenCalledWith({ where: { id: "s2", restaurantId: "r1" }, select: { id: true } });
    expect(written()).toEqual({ where: { id: "inv1", restaurantId: "r1", deletedAt: null, status: "review" }, data: { supplierId: "s2" } });
  });

  it("a typed supplier name is created on first use and reused after", async () => {
    await patch({ supplierName: "  GARDEN FRUIT s.r.l. " });
    expect(db.supplier.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId_nameNorm: { restaurantId: "r1", nameNorm: "garden fruit" } },
    }));
    expect(written().data).toEqual({ supplierId: "s9" });
  });

  it("corrects the number and the date, and can clear both", async () => {
    await patch({ number: " 77/B ", issuedOn: "2026-10-10" });
    expect(written().data).toEqual({ number: "77/B", issuedOn: new Date("2026-10-10T00:00:00Z") });
    await patch({ number: "", issuedOn: null });
    expect(db.invoice.updateMany.mock.calls[1]![0].data).toEqual({ number: null, issuedOn: null });
  });

  it.each([["2026-02-31"], ["2026-10-18"], ["15/10/2026"]])("refuses the impossible or future date %s", async (issuedOn) => {
    const res = await patch({ issuedOn });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_body" });
    expect(db.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("refuses both supplier fields at once, and a name that is only a company form", async () => {
    expect((await patch({ supplierId: "s2", supplierName: "Recchioni" })).status).toBe(400);
    expect((await patch({ supplierName: "S.r.l." })).status).toBe(400);
    expect(db.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("a supplier of another restaurant is not found", async () => {
    db.supplier.findFirst.mockResolvedValue(null);
    const res = await patch({ supplierId: "other" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "supplier_not_found" });
  });

  it("only an invoice in review changes", async () => {
    db.invoice.findFirst.mockResolvedValueOnce(null);
    expect((await patch({ number: "1" })).status).toBe(404);
    db.invoice.findFirst.mockResolvedValueOnce({ status: "applied" });
    expect(await (await patch({ number: "1" })).json()).toMatchObject({ code: "invoice_not_in_review" });
    db.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await patch({ number: "1" })).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run app/api/invoices/__tests__/header-patch.test.ts`
Expected: FAIL — `PATCH` is not exported by `[id]/route.ts`.

- [ ] **Step 3: Move the header helpers**

Create `apps/api/lib/invoices/header.ts`:

```ts
// apps/api/lib/invoices/header.ts
// The parts of an invoice header that the read writes and the chef can correct: the supplier
// (one row per normalized name, created on first use) and the printed date.
import { prisma } from "@atelier/db";
import { normalizeSupplierName } from "./line-matching";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// A misread date ("2026-13-10", "2026-02-31") would fail the save, and a future one would date
// the price ahead and freeze it: such a date is dropped (null).
export function plausibleDate(raw: string | null, uploadedAt: Date): string | null {
  if (!raw || !DATE.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(+date) || date.toISOString().slice(0, 10) !== raw) return null;
  return +date <= +uploadedAt + DAY_MS ? raw : null;
}

export async function upsertSupplier(restaurantId: string, name: string | null, taxId: string | null): Promise<string | null> {
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
    // Two writes of the same new supplier race on the unique key: the loser reuses the winner's row.
    if ((error as { code?: unknown }).code !== "P2002") throw error;
    const existing = await prisma.supplier.findUnique({ where: { restaurantId_nameNorm: { restaurantId, nameNorm } }, select: { id: true } });
    return existing?.id ?? null;
  }
}
```

In `apps/api/lib/invoices/read-invoice.ts`: delete `DATE`, `DAY_MS`, `plausibleDate` and `upsertSupplier` (lines 41-70), change `import { normalizeSupplierName, type SecondLook } from "./line-matching";` to `import { type SecondLook } from "./line-matching";`, and add `import { plausibleDate, upsertSupplier } from "./header";`.

- [ ] **Step 4: Add the contract and the route**

`packages/shared/src/invoices-contract.ts`, after `InvoiceLinePatch`:

```ts
// The chef's corrections to what was read in the header. The supplier is either one that
// already exists (supplierId) or a typed name (created on first use), never both.
export const invoiceHeaderPatchSchema = z
  .object({
    supplierId: z.string().min(1).max(100).optional(),
    supplierName: z.string().trim().min(1).max(200).optional(),
    number: z.string().trim().max(60).nullable().optional(),
    issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine((b) => b.supplierId === undefined || b.supplierName === undefined, {
    message: "Send supplierId or supplierName, not both",
  });
export type InvoiceHeaderPatch = z.infer<typeof invoiceHeaderPatchSchema>;
```

`apps/api/app/api/invoices/[id]/route.ts`: update the header comment to `// GET: one invoice … PATCH: the chef's header corrections, only while in review. DELETE: …`, add imports:

```ts
import { invoiceHeaderPatchSchema, type InvoiceDetail, type InvoiceLineView } from "@atelier/shared";
import { plausibleDate, upsertSupplier } from "@/lib/invoices/header";
```

(replacing the existing `import type { InvoiceDetail, InvoiceLineView } from "@atelier/shared";`), add under `const num = …`:

```ts
const fail = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status });
```

and add before `DELETE`:

```ts
export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;
  const parsed = invoiceHeaderPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_body", "Invalid body");
  const body = parsed.data;
  if (body.issuedOn && !plausibleDate(body.issuedOn, new Date())) return fail(400, "invalid_body", "Invalid date");

  const invoice = await prisma.invoice.findFirst({ where: { id, restaurantId: ctx.restaurantId, deletedAt: null }, select: { status: true } });
  if (!invoice) return fail(404, "invoice_not_found", "Not found");
  if (invoice.status !== "review") return fail(409, "invoice_not_in_review", "The invoice is not in review");

  const data: { supplierId?: string; number?: string | null; issuedOn?: Date | null } = {};
  if (body.supplierId !== undefined) {
    const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, restaurantId: ctx.restaurantId }, select: { id: true } });
    if (!supplier) return fail(404, "supplier_not_found", "Supplier not found");
    data.supplierId = supplier.id;
  }
  if (body.supplierName !== undefined) {
    const supplierId = await upsertSupplier(ctx.restaurantId, body.supplierName, null);
    if (!supplierId) return fail(400, "invalid_body", "Invalid supplier name");
    data.supplierId = supplierId;
  }
  if (body.number !== undefined) data.number = body.number || null;
  if (body.issuedOn !== undefined) data.issuedOn = body.issuedOn ? new Date(`${body.issuedOn}T00:00:00Z`) : null;

  const updated = await prisma.invoice.updateMany({ where: { id, restaurantId: ctx.restaurantId, deletedAt: null, status: "review" }, data });
  if (updated.count === 0) return fail(409, "invoice_not_in_review", "The invoice is not in review");
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter api exec vitest run app/api/invoices lib/invoices`
Expected: PASS (the new file, and `read-invoice.test.ts` unchanged and green after the move).

- [ ] **Step 6: Commit**

```bash
git add apps/api/lib/invoices/header.ts apps/api/lib/invoices/read-invoice.ts packages/shared/src/invoices-contract.ts "apps/api/app/api/invoices/[id]/route.ts" apps/api/app/api/invoices/__tests__/header-patch.test.ts
git commit -m "feat(invoices): let the chef correct supplier, number and date before applying"
```

---

### Task 3: Upload limit under Vercel's body cap, and no orphan file

**Files:**
- Modify: `apps/api/lib/invoices/upload.ts`
- Modify: `apps/api/app/api/invoices/route.ts:33-60`
- Test: `apps/api/lib/invoices/upload.test.ts`, `apps/api/app/api/invoices/__tests__/upload.test.ts`

**Interfaces:**
- Produces: `MAX_UPLOAD_BYTES = 4 * 1024 * 1024` exported from `upload.ts`; a file over it → `413 { code: "file_too_large" }` (other rejections keep `file_invalid`).

- [ ] **Step 1: Write the failing tests**

In `apps/api/lib/invoices/upload.test.ts`, replace the last two cases ("rejects a photo over 6 MB", "accepts a PDF up to 10 MB") with:

```ts
  it.each([[JPEG, "image/jpeg"], [PDF, "application/pdf"]])("rejects any file over 4 MB as too large (%#)", async (bytes, type) =>
    expect(await readUploadedPage(form(bytes, type, "big", 4 * 1024 * 1024 + 1), { imagesOnly: false }))
      .toMatchObject({ status: 413, body: { code: "file_too_large" } }));
  it("accepts a file of exactly 4 MB", async () =>
    expect(await readUploadedPage(form(PDF, "application/pdf", "f.pdf", 4 * 1024 * 1024), { imagesOnly: false })).toMatchObject({ mimeType: "application/pdf" }));
```

In `apps/api/app/api/invoices/__tests__/upload.test.ts`, inside `describe("POST /api/invoices")`:

```ts
  it("a page row that cannot be saved removes its stored file", async () => {
    db.invoicePage.create.mockRejectedValueOnce(new Error("db down"));
    await expect(create(multipart("https://t.local/api/invoices", JPEG, "image/jpeg"))).rejects.toThrow("db down");
    expect(storage.deleteInvoiceFiles).toHaveBeenCalledWith(["invoices/r1/inv1/a.jpg"]);
    expect(db.invoice.delete).toHaveBeenCalledWith({ where: { id: "inv1" } });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter api exec vitest run lib/invoices/upload.test.ts app/api/invoices/__tests__/upload.test.ts`
Expected: FAIL — a 4 MB + 1 photo is accepted, the PDF gets no `file_too_large`, and `deleteInvoiceFiles` is not called.

- [ ] **Step 3: Implement**

`apps/api/lib/invoices/upload.ts`: replace the header comment's last line and the limits:

```ts
// Vercel refuses request bodies over 4.5 MB before the route runs, so every file stays under
// 4 MB: the app compresses photos to fit, and a heavier PDF is refused with its own code.
import { fileMatchesMime, IMAGE_MIMES, PDF_MIME } from "../recipe-extraction";

export const MAX_INVOICE_PAGES = 10;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type UploadedPage = { buffer: Uint8Array; mimeType: string; sizeBytes: number };
export type UploadRejection = { status: 400 | 413 | 415; body: { error: string; code: "file_invalid" | "file_too_large" } };
```

```ts
const reject = (status: UploadRejection["status"], error: string, code: UploadRejection["body"]["code"] = "file_invalid"): UploadRejection =>
  ({ status, body: { error, code } });
```

and the size check:

```ts
  if (file.size > MAX_UPLOAD_BYTES) return reject(413, "File too large", "file_too_large");
```

`apps/api/app/api/invoices/route.ts`: import `deleteInvoiceFiles` next to `storeInvoiceFile` / `InvoiceStorageError` from `@/lib/invoices/storage`, and change the `try`/`catch` of `POST`:

```ts
  let storageKey: string | null = null;
  try {
    storageKey = await storeInvoiceFile(ctx.restaurantId, invoice.id, page.buffer, page.mimeType);
    await prisma.invoicePage.create({
      data: { invoiceId: invoice.id, position: 0, storageKey, mimeType: page.mimeType, sizeBytes: page.sizeBytes },
    });
  } catch (error) {
    // A file whose page row was never saved would be found by nothing: remove it now.
    if (storageKey) await deleteInvoiceFiles([storageKey]);
    try {
```

(the rest of the `catch` stays as it is).

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter api exec vitest run lib/invoices app/api/invoices`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/invoices/upload.ts apps/api/lib/invoices/upload.test.ts apps/api/app/api/invoices/route.ts apps/api/app/api/invoices/__tests__/upload.test.ts
git commit -m "fix(invoices): 4 MB upload limit under Vercel's body cap and no orphan file"
```

---

### Task 4: Storage outages on read, and an ignore that can be undone

**Files:**
- Modify: `apps/api/lib/invoices/storage.ts:32-36`
- Modify: `apps/api/app/api/invoices/[id]/pages/[position]/route.ts`
- Modify: `apps/api/app/api/invoices/[id]/lines/[position]/route.ts`
- Test: `apps/api/lib/invoices/storage.test.ts`, `apps/api/app/api/invoices/__tests__/read-routes.test.ts`, `apps/api/app/api/invoices/__tests__/line-patch.test.ts`

**Interfaces:**
- Produces: `openInvoiceFile` throws `InvoiceStorageError("invoice_storage_unavailable")` when storage fails, returns `null` when the file is gone. `GET /api/invoices/[id]/pages/[position]` → `503 { code: "invoice_storage_unavailable" }` on an outage. A line PATCH with `action: "ignore"` keeps `productId` and `appliedPriceCents`.

- [ ] **Step 1: Write the failing tests**

`apps/api/lib/invoices/storage.test.ts`: change the import to

```ts
import { deleteInvoiceFiles, deleteRestaurantInvoiceFiles, InvoiceStorageError, openInvoiceFile, readInvoiceFile, storeInvoiceFile } from "./storage";
```

and add inside `describe("invoice storage")`:

```ts
  it("a storage outage while reading becomes invoice_storage_unavailable", async () => {
    blob.get.mockRejectedValue(new Error("fetch failed"));
    await expect(openInvoiceFile("k")).rejects.toThrow(InvoiceStorageError);
    await expect(readInvoiceFile("k")).rejects.toMatchObject({ message: "invoice_storage_unavailable" });
  });

  it("a file the store does not have is simply missing", async () => {
    blob.get.mockRejectedValue(Object.assign(new Error("not found"), { name: "BlobNotFoundError" }));
    expect(await readInvoiceFile("k")).toBeNull();
  });
```

`apps/api/app/api/invoices/__tests__/read-routes.test.ts`: add `import { InvoiceStorageError } from "@/lib/invoices/storage";` after the mocks, and inside `describe("GET /api/invoices/[id]/pages/[position]")`:

```ts
  it("a storage outage is 503, not a crash", async () => {
    db.invoicePage.findFirst.mockResolvedValue({ storageKey: "k" });
    storage.openInvoiceFile.mockRejectedValue(new InvoiceStorageError("invoice_storage_unavailable"));
    const res = await pageFile(req(), params({ id: "inv1", position: "0" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "invoice_storage_unavailable" });
  });
```

`apps/api/app/api/invoices/__tests__/line-patch.test.ts`: replace the case "ignoring clears product and price" with:

```ts
  it("ignoring keeps product and price, so the chef can take it back", async () => {
    await patch({ action: "ignore" });
    expect(written().data).toEqual({ action: "ignore", productId: "p1", appliedPriceCents: 1100, matchLevel: "probable" });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter api exec vitest run lib/invoices/storage.test.ts app/api/invoices/__tests__/read-routes.test.ts app/api/invoices/__tests__/line-patch.test.ts`
Expected: FAIL — the raw `fetch failed` error escapes, the page route throws instead of 503, and ignore writes `productId: null`.

- [ ] **Step 3: Implement**

`apps/api/lib/invoices/storage.ts`, replace `openInvoiceFile`:

```ts
export async function openInvoiceFile(storageKey: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  const auth = token();
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(storageKey, { access: "private", token: auth });
  } catch (error) {
    if (error instanceof Error && error.name === "BlobNotFoundError") return null;
    logger.error("invoice_storage_get_failed", { message: message(error) });
    throw new InvoiceStorageError("invoice_storage_unavailable");
  }
  if (!result || result.statusCode !== 200) return null;
  return { stream: result.stream, contentType: result.blob.contentType };
}
```

`apps/api/app/api/invoices/[id]/pages/[position]/route.ts`: import `InvoiceStorageError` with `openInvoiceFile`, and replace `const file = await openInvoiceFile(page.storageKey);` with:

```ts
  let file: Awaited<ReturnType<typeof openInvoiceFile>>;
  try {
    file = await openInvoiceFile(page.storageKey);
  } catch (error) {
    if (!(error instanceof InvoiceStorageError)) throw error;
    return NextResponse.json({ error: "Invoice storage unavailable", code: "invoice_storage_unavailable" }, { status: 503 });
  }
```

`apps/api/app/api/invoices/[id]/lines/[position]/route.ts`: replace `let productId: string | null = null;` with

```ts
  // Ignoring keeps the proposal on the line, so choosing "update price" again brings it back.
  let productId: string | null = body.action === "ignore" ? line.productId : null;
```

and delete the line `if (body.action === "ignore") price = null;`. Update the file's header comment to add: `Ignore keeps product and price so it can be undone; apply skips ignored lines.`

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter api exec vitest run lib/invoices app/api/invoices`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/invoices/storage.ts apps/api/lib/invoices/storage.test.ts "apps/api/app/api/invoices/[id]/pages/[position]/route.ts" "apps/api/app/api/invoices/[id]/lines/[position]/route.ts" apps/api/app/api/invoices/__tests__/read-routes.test.ts apps/api/app/api/invoices/__tests__/line-patch.test.ts
git commit -m "fix(invoices): storage outages answer 503 and an ignored line can be taken back"
```

---

### Task 5: Invoice API client and its error messages

**Files:**
- Create: `apps/mobile/src/api/invoices.ts`
- Modify: `packages/shared/src/api-contract.ts` (`ApiErrorCodeSchema`)
- Modify: `apps/mobile/src/lib/api-error.ts` (`CODE_TO_KEY`)
- Modify: `packages/i18n/src/{es,it,en}.ts`
- Test: `apps/mobile/src/api/__tests__/invoices.test.ts`

**Interfaces:**
- Consumes: Task 2 `InvoiceHeaderPatch`; shared `InvoiceDetail`, `InvoiceListResponse`, `InvoiceLinePatch`, `InvoiceLineAction`, `InvoiceMatchLevel`.
- Produces (all from `@/src/api/invoices`):
  - `listInvoices(): Promise<InvoiceListResponse>`, `getInvoice(id): Promise<InvoiceDetail>`
  - `startInvoice(uri, mimeType): Promise<{ id: string; pages: number }>`, `addInvoicePage(id, uri, mimeType): Promise<{ position: number }>`
  - `startInvoiceRead(id)`, `retryInvoice(id)`, `deleteInvoice(id)`: `Promise<unknown>`
  - `patchInvoiceHeader(id, body: InvoiceHeaderPatch): Promise<{ ok: true }>`
  - `patchInvoiceLine(id, position, body: InvoiceLinePatch): Promise<InvoiceLineDecision>`
  - `chooseProduct(id, position, productId): Promise<InvoiceLineDecision>`
  - `applyInvoice(id): Promise<InvoiceApplyResult>`
  - `invoicePageSource(id, position): Promise<{ uri: string; headers: Record<string, string> }>`
  - types `InvoiceLineDecision`, `InvoiceApplySkipped`, `InvoiceApplyResult`.
- Produces i18n keys: `invoice_file_too_large`, `invoice_scan_too_many_pages`, `error_invoice_storage_unavailable`, `error_invoice_not_uploading`, `error_invoice_pdf_single_file`, `error_invoice_page_conflict`, `error_invoice_not_found`, `error_invoice_not_in_review`, `error_lines_undecided`, `error_product_required`, `error_price_required`, `error_supplier_not_found`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/api/__tests__/invoices.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getToken: vi.fn(), upload: vi.fn(), fetch: vi.fn() }));

vi.mock("@/src/lib/secure-storage", () => ({ getItemAsync: h.getToken }));
vi.mock("expo-file-system/legacy", () => ({ uploadAsync: h.upload, FileSystemUploadType: { MULTIPART: 1 } }));
vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "es", languageTag: "es-ES" }] }));
vi.mock("../client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../client")>()), apiFetch: h.fetch }));

import { chooseProduct, invoicePageSource, startInvoice } from "../invoices";
import { ApiError, NetworkError } from "../client";
import { apiErrorMessage } from "@/src/lib/api-error";

const t = (key: string) => `t:${key}`;

beforeEach(() => {
  vi.resetAllMocks();
  h.getToken.mockResolvedValue("session-token");
});

describe("invoice uploads", () => {
  it("sends the first page as multipart with the session token", async () => {
    h.upload.mockResolvedValue({ status: 201, body: '{"id":"inv1","pages":1}' });
    expect(await startInvoice("file:///p1.jpg", "image/jpeg")).toEqual({ id: "inv1", pages: 1 });
    expect(h.upload).toHaveBeenCalledWith(expect.stringMatching(/\/api\/invoices$/), "file:///p1.jpg", {
      httpMethod: "POST", uploadType: 1, fieldName: "file", mimeType: "image/jpeg", headers: { Authorization: "Bearer session-token" },
    });
  });

  it("a file the server finds too large is explained, not shown raw", async () => {
    h.upload.mockResolvedValue({ status: 413, body: '{"error":"File too large","code":"file_too_large"}' });
    const error = await startInvoice("file:///big.pdf", "application/pdf").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(apiErrorMessage(error, t)).toBe("t:invoice_file_too_large");
  });

  it("no connection is a network error", async () => {
    h.upload.mockRejectedValue(new Error("Network request failed"));
    await expect(startInvoice("file:///p1.jpg", "image/jpeg")).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("chooseProduct", () => {
  it("updates the price when the line's price fits the product", async () => {
    h.fetch.mockResolvedValue({ position: 2, action: "update_price" });
    await chooseProduct("inv1", 2, "p9");
    expect(h.fetch).toHaveBeenCalledWith("/api/invoices/inv1/lines/2", { method: "PATCH", body: JSON.stringify({ action: "update_price", productId: "p9" }) });
  });

  it("falls back to linking when no price fits the product's unit", async () => {
    h.fetch.mockRejectedValueOnce(new ApiError(400, "Enter a price", "price_required")).mockResolvedValueOnce({ position: 2, action: "connect" });
    expect(await chooseProduct("inv1", 2, "p9")).toMatchObject({ action: "connect" });
    expect(h.fetch).toHaveBeenLastCalledWith("/api/invoices/inv1/lines/2", { method: "PATCH", body: JSON.stringify({ action: "connect", productId: "p9" }) });
  });

  it("any other refusal reaches the screen", async () => {
    h.fetch.mockRejectedValue(new ApiError(409, "The invoice is not in review", "invoice_not_in_review"));
    await expect(chooseProduct("inv1", 2, "p9")).rejects.toMatchObject({ code: "invoice_not_in_review" });
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});

it("an original page is loaded with the session token", async () => {
  expect(await invoicePageSource("inv1", 1)).toEqual({
    uri: expect.stringMatching(/\/api\/invoices\/inv1\/pages\/1$/), headers: { Authorization: "Bearer session-token" },
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter mobile exec vitest run src/api/__tests__/invoices.test.ts`
Expected: FAIL — `Failed to resolve import "../invoices"`.

- [ ] **Step 3: Write the client**

Create `apps/mobile/src/api/invoices.ts`:

```ts
// Supplier invoices: send the pages, follow the read, decide each line, apply.
// Uploads go through FileSystem.uploadAsync: fetch + FormData fails in standalone builds.
import * as FileSystem from "expo-file-system/legacy";
import type {
  ApiErrorCode, InvoiceDetail, InvoiceHeaderPatch, InvoiceLineAction, InvoiceLinePatch, InvoiceListResponse, InvoiceMatchLevel,
} from "@atelier/shared";
import * as SecureStore from "@/src/lib/secure-storage";
import { ApiError, apiFetch, BASE, NetworkError, TOKEN_KEY } from "./client";

export type InvoiceLineDecision = {
  position: number;
  action: InvoiceLineAction;
  productId: string | null;
  appliedPriceCents: number | null;
  matchLevel: InvoiceMatchLevel;
};
export type InvoiceApplySkipped = { position: number; reason: "product_deleted" | "newer_price" };
export type InvoiceApplyResult =
  | { alreadyApplied: true }
  | { alreadyApplied?: undefined; updated: number; drafts: number; connected: number; ignored: number; skipped: InvoiceApplySkipped[] };

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function upload<T>(path: string, uri: string, mimeType: string): Promise<T> {
  const headers = await authHeaders();
  let res: FileSystem.FileSystemUploadResult;
  try {
    res = await FileSystem.uploadAsync(`${BASE}${path}`, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      headers,
    });
  } catch {
    throw new NetworkError();
  }
  if (res.status < 200 || res.status >= 300) {
    let message = `HTTP ${res.status}`;
    let code: ApiErrorCode | undefined;
    try {
      const json = JSON.parse(res.body);
      message = json?.error ?? message;
      if (typeof json?.code === "string") code = json.code as ApiErrorCode;
    } catch {}
    throw new ApiError(res.status, message, code);
  }
  return JSON.parse(res.body) as T;
}

export const listInvoices = () => apiFetch<InvoiceListResponse>("/api/invoices");
export const getInvoice = (id: string) => apiFetch<InvoiceDetail>(`/api/invoices/${id}`);
export const startInvoice = (uri: string, mimeType: string) => upload<{ id: string; pages: number }>("/api/invoices", uri, mimeType);
export const addInvoicePage = (id: string, uri: string, mimeType: string) =>
  upload<{ position: number }>(`/api/invoices/${id}/pages`, uri, mimeType);
export const startInvoiceRead = (id: string) => apiFetch<unknown>(`/api/invoices/${id}/read`, { method: "POST" });
export const retryInvoice = (id: string) => apiFetch<unknown>(`/api/invoices/${id}/retry`, { method: "POST" });
export const deleteInvoice = (id: string) => apiFetch<unknown>(`/api/invoices/${id}`, { method: "DELETE" });
export const patchInvoiceHeader = (id: string, body: InvoiceHeaderPatch) =>
  apiFetch<{ ok: true }>(`/api/invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const patchInvoiceLine = (id: string, position: number, body: InvoiceLinePatch) =>
  apiFetch<InvoiceLineDecision>(`/api/invoices/${id}/lines/${position}`, { method: "PATCH", body: JSON.stringify(body) });
export const applyInvoice = (id: string) => apiFetch<InvoiceApplyResult>(`/api/invoices/${id}/apply`, { method: "POST" });

// Picking a product updates its price when the line's price converts to the product's unit;
// when it does not, the server answers price_required and the line is only linked.
export async function chooseProduct(id: string, position: number, productId: string): Promise<InvoiceLineDecision> {
  try {
    return await patchInvoiceLine(id, position, { action: "update_price", productId });
  } catch (error) {
    if (error instanceof ApiError && error.code === "price_required") return patchInvoiceLine(id, position, { action: "connect", productId });
    throw error;
  }
}

// The original pages are private: an <Image> or a download needs the session token.
export async function invoicePageSource(id: string, position: number): Promise<{ uri: string; headers: Record<string, string> }> {
  return { uri: `${BASE}/api/invoices/${id}/pages/${position}`, headers: await authHeaders() };
}
```

- [ ] **Step 4: Register the error codes and their copy**

`packages/shared/src/api-contract.ts`, append to `ApiErrorCodeSchema` (before the closing `]);`):

```ts
  // Supplier invoices.
  "file_too_large",
  "invoice_storage_unavailable",
  "invoice_not_uploading",
  "invoice_pdf_single_file",
  "invoice_too_many_pages",
  "invoice_page_conflict",
  "invoice_not_found",
  "invoice_not_in_review",
  "lines_undecided",
  "product_required",
  "price_required",
  "supplier_not_found",
```

`apps/mobile/src/lib/api-error.ts`, append to `CODE_TO_KEY`:

```ts
  file_too_large: "invoice_file_too_large",
  invoice_storage_unavailable: "error_invoice_storage_unavailable",
  invoice_not_uploading: "error_invoice_not_uploading",
  invoice_pdf_single_file: "error_invoice_pdf_single_file",
  invoice_too_many_pages: "invoice_scan_too_many_pages",
  invoice_page_conflict: "error_invoice_page_conflict",
  invoice_not_found: "error_invoice_not_found",
  invoice_not_in_review: "error_invoice_not_in_review",
  lines_undecided: "error_lines_undecided",
  product_required: "error_product_required",
  price_required: "error_price_required",
  supplier_not_found: "error_supplier_not_found",
```

`packages/i18n/src/es.ts` (end of the object):

```ts
  invoice_file_too_large: "El archivo pesa demasiado (máximo 4 MB).",
  invoice_scan_too_many_pages: "Máximo 10 páginas por factura.",
  error_invoice_storage_unavailable: "No se pudo guardar la factura. Inténtalo de nuevo en unos minutos.",
  error_invoice_not_uploading: "Esta factura ya se envió.",
  error_invoice_pdf_single_file: "Un PDF va solo: no se le pueden añadir páginas.",
  error_invoice_page_conflict: "Otra página se subió a la vez. Inténtalo de nuevo.",
  error_invoice_not_found: "Esta factura ya no existe.",
  error_invoice_not_in_review: "Esta factura ya no está en revisión.",
  error_lines_undecided: "Aún hay líneas sin decidir.",
  error_product_required: "Elige un producto.",
  error_price_required: "Escribe un precio.",
  error_supplier_not_found: "Ese proveedor ya no existe.",
```

`packages/i18n/src/it.ts`:

```ts
  invoice_file_too_large: "Il file è troppo pesante (massimo 4 MB).",
  invoice_scan_too_many_pages: "Massimo 10 pagine per fattura.",
  error_invoice_storage_unavailable: "Non è stato possibile salvare la fattura. Riprova tra qualche minuto.",
  error_invoice_not_uploading: "Questa fattura è già stata inviata.",
  error_invoice_pdf_single_file: "Un PDF va da solo: non si possono aggiungere pagine.",
  error_invoice_page_conflict: "Un'altra pagina è stata caricata nello stesso momento. Riprova.",
  error_invoice_not_found: "Questa fattura non esiste più.",
  error_invoice_not_in_review: "Questa fattura non è più in revisione.",
  error_lines_undecided: "Ci sono ancora righe da decidere.",
  error_product_required: "Scegli un prodotto.",
  error_price_required: "Scrivi un prezzo.",
  error_supplier_not_found: "Questo fornitore non esiste più.",
```

`packages/i18n/src/en.ts`:

```ts
  invoice_file_too_large: "The file is too large (4 MB at most).",
  invoice_scan_too_many_pages: "At most 10 pages per invoice.",
  error_invoice_storage_unavailable: "The invoice could not be saved. Try again in a few minutes.",
  error_invoice_not_uploading: "This invoice was already sent.",
  error_invoice_pdf_single_file: "A PDF goes alone: pages cannot be added to it.",
  error_invoice_page_conflict: "Another page was uploaded at the same time. Try again.",
  error_invoice_not_found: "This invoice no longer exists.",
  error_invoice_not_in_review: "This invoice is no longer in review.",
  error_lines_undecided: "Some lines are still undecided.",
  error_product_required: "Choose a product.",
  error_price_required: "Enter a price.",
  error_supplier_not_found: "That supplier no longer exists.",
```

- [ ] **Step 5: Run the test and typecheck**

Run: `pnpm --filter mobile exec vitest run src/api/__tests__/invoices.test.ts`
Expected: PASS (7 tests).
Run: `pnpm typecheck`
Expected: no errors (an enum code without its `CODE_TO_KEY` entry, or a key missing in a language, fails here).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/api/invoices.ts apps/mobile/src/api/__tests__/invoices.test.ts apps/mobile/src/lib/api-error.ts packages/shared/src/api-contract.ts packages/i18n/src
git commit -m "feat(mobile): invoice API client with translated invoice errors"
```

---

### Task 6: Prepare photos and PDFs for upload

**Files:**
- Modify: `apps/mobile/package.json` (via `npx expo install expo-image-manipulator`)
- Create: `apps/mobile/src/lib/invoice-image.ts`
- Test: `apps/mobile/src/lib/__tests__/invoice-image.test.ts`

**Interfaces:**
- Produces: `prepareInvoiceFile(file: PickedFile): Promise<PreparedFile>`; `PickedFile = { uri: string; mimeType?: string | null; size?: number | null; width?: number; height?: number }`; `PreparedFile = { uri: string; mimeType: string }`; `class InvoiceFileTooLargeError extends Error`; `MAX_UPLOAD_BYTES = 4 * 1024 * 1024`.

- [ ] **Step 1: Install the dependency**

Run: `cd apps/mobile && npx expo install expo-image-manipulator`
Expected: `package.json` gains `"expo-image-manipulator": "~56.x.x"` (the SDK 56 version) and the lockfile updates.

- [ ] **Step 2: Write the failing test**

Create `apps/mobile/src/lib/__tests__/invoice-image.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ resize: vi.fn(), save: vi.fn(), info: vi.fn(), sizes: [] as number[] }));

vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => {
      const context = { resize: (size: unknown) => { h.resize(size); return context; }, renderAsync: async () => ({ saveAsync: h.save }) };
      return context;
    },
  },
}));
vi.mock("expo-file-system/legacy", () => ({ getInfoAsync: h.info }));

import { InvoiceFileTooLargeError, prepareInvoiceFile } from "../invoice-image";

const MB = 1024 * 1024;

beforeEach(() => {
  vi.resetAllMocks();
  h.sizes = [2 * MB];
  let n = 0;
  h.save.mockImplementation(async () => ({ uri: `file:///out-${++n}.jpg` }));
  h.info.mockImplementation(async () => ({ exists: true, size: h.sizes.shift() ?? 2 * MB }));
});

describe("prepareInvoiceFile", () => {
  it("shrinks a 12 MP landscape photo to 2400 px wide JPEG", async () => {
    expect(await prepareInvoiceFile({ uri: "file:///a.jpg", mimeType: "image/jpeg", width: 4032, height: 3024 }))
      .toEqual({ uri: "file:///out-1.jpg", mimeType: "image/jpeg" });
    expect(h.resize).toHaveBeenCalledWith({ width: 2400 });
    expect(h.save).toHaveBeenCalledWith({ compress: 0.7, format: "jpeg" });
  });

  it("re-encodes a HEIC portrait photo as JPEG, 2400 px tall", async () => {
    expect(await prepareInvoiceFile({ uri: "file:///b.heic", mimeType: "image/heic", width: 3024, height: 4032 }))
      .toMatchObject({ mimeType: "image/jpeg" });
    expect(h.resize).toHaveBeenCalledWith({ height: 2400 });
  });

  it("never enlarges a small photo", async () => {
    await prepareInvoiceFile({ uri: "file:///c.png", mimeType: "image/png", width: 1200, height: 900 });
    expect(h.resize).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  it("a photo still too heavy gets a second, smaller pass", async () => {
    h.sizes = [3.8 * MB, 1.5 * MB];
    expect(await prepareInvoiceFile({ uri: "file:///d.jpg", mimeType: "image/jpeg", width: 4000, height: 3000 }))
      .toEqual({ uri: "file:///out-2.jpg", mimeType: "image/jpeg" });
    expect(h.resize).toHaveBeenLastCalledWith({ width: 1800 });
    expect(h.save).toHaveBeenLastCalledWith({ compress: 0.5, format: "jpeg" });
  });

  it("a photo that never fits is refused", async () => {
    h.sizes = [5 * MB, 4.2 * MB];
    await expect(prepareInvoiceFile({ uri: "file:///e.jpg", mimeType: "image/jpeg", width: 4000, height: 3000 }))
      .rejects.toBeInstanceOf(InvoiceFileTooLargeError);
  });

  it("a PDF goes as it is up to 4 MB and is refused above", async () => {
    expect(await prepareInvoiceFile({ uri: "file:///f.pdf", mimeType: "application/pdf", size: 3 * MB }))
      .toEqual({ uri: "file:///f.pdf", mimeType: "application/pdf" });
    await expect(prepareInvoiceFile({ uri: "file:///g.pdf", mimeType: "application/pdf", size: 4 * MB + 1 }))
      .rejects.toBeInstanceOf(InvoiceFileTooLargeError);
    expect(h.save).not.toHaveBeenCalled();
  });

  it("a PDF without a reported size is measured on disk", async () => {
    h.sizes = [5 * MB];
    await expect(prepareInvoiceFile({ uri: "file:///h.PDF", mimeType: null })).rejects.toBeInstanceOf(InvoiceFileTooLargeError);
    expect(h.info).toHaveBeenCalledWith("file:///h.PDF");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/invoice-image.test.ts`
Expected: FAIL — `Failed to resolve import "../invoice-image"`.

- [ ] **Step 4: Implement**

Create `apps/mobile/src/lib/invoice-image.ts`:

```ts
// Every invoice file must reach the server under Vercel's 4.5 MB request limit (the API
// refuses more than 4 MB). Photos are re-encoded as JPEG — which also turns iPhone HEIC into
// a type the server reads — with the long side at most 2400 px; a second, smaller pass runs
// when the first is still too heavy. A PDF cannot be shrunk here: over 4 MB it is refused.
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const PHOTO_TARGET_BYTES = 3.5 * 1024 * 1024;
const PASSES = [
  { longSide: 2400, compress: 0.7 },
  { longSide: 1800, compress: 0.5 },
] as const;

export type PickedFile = { uri: string; mimeType?: string | null; size?: number | null; width?: number; height?: number };
export type PreparedFile = { uri: string; mimeType: string };

export class InvoiceFileTooLargeError extends Error {
  constructor() {
    super("invoice_file_too_large");
  }
}

async function sizeOf(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && typeof info.size === "number" ? info.size : Number.POSITIVE_INFINITY;
}

async function encodePhoto(file: PickedFile, pass: (typeof PASSES)[number]): Promise<string> {
  const width = file.width ?? 0;
  const height = file.height ?? 0;
  const context = ImageManipulator.manipulate(file.uri);
  if (Math.max(width, height) > pass.longSide) context.resize(width >= height ? { width: pass.longSide } : { height: pass.longSide });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: pass.compress, format: SaveFormat.JPEG });
  return saved.uri;
}

export async function prepareInvoiceFile(file: PickedFile): Promise<PreparedFile> {
  const isPdf = file.mimeType === "application/pdf" || file.uri.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const size = file.size ?? (await sizeOf(file.uri));
    if (size > MAX_UPLOAD_BYTES) throw new InvoiceFileTooLargeError();
    return { uri: file.uri, mimeType: "application/pdf" };
  }
  for (const pass of PASSES) {
    const uri = await encodePhoto(file, pass);
    if ((await sizeOf(uri)) <= PHOTO_TARGET_BYTES) return { uri, mimeType: "image/jpeg" };
  }
  throw new InvoiceFileTooLargeError();
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/invoice-image.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/lib/invoice-image.ts apps/mobile/src/lib/__tests__/invoice-image.test.ts
git commit -m "feat(mobile): compress invoice photos under the upload limit"
```

---

### Task 7: Send what was scanned

**Files:**
- Create: `apps/mobile/src/lib/invoice-upload.ts`
- Test: `apps/mobile/src/lib/__tests__/invoice-upload.test.ts`

**Interfaces:**
- Consumes: Task 5 `startInvoice`, `addInvoicePage`, `startInvoiceRead`, `deleteInvoice`; Task 6 `PreparedFile`.
- Produces: `sendInvoice(pages: ReadonlyArray<PreparedFile>): Promise<string>` (invoice id), `invoiceBatches(photos, pdfs): PreparedFile[][]`, `sendInvoices(batches): Promise<SendResult>`, `SendResult = { ids: string[]; failed: Array<ReadonlyArray<PreparedFile>>; error: unknown }`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/__tests__/invoice-upload.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ start: vi.fn(), add: vi.fn(), read: vi.fn(), remove: vi.fn(), calls: [] as string[] }));
vi.mock("@/src/api/invoices", () => ({
  startInvoice: h.start, addInvoicePage: h.add, startInvoiceRead: h.read, deleteInvoice: h.remove,
}));

import { invoiceBatches, sendInvoice, sendInvoices } from "../invoice-upload";

const jpg = (n: number) => ({ uri: `file:///p${n}.jpg`, mimeType: "image/jpeg" });
const pdf = (n: number) => ({ uri: `file:///f${n}.pdf`, mimeType: "application/pdf" });

beforeEach(() => {
  vi.resetAllMocks();
  h.calls = [];
  let n = 0;
  h.start.mockImplementation(async (uri: string) => { h.calls.push(`start ${uri}`); return { id: `inv${++n}`, pages: 1 }; });
  h.add.mockImplementation(async (id: string, uri: string) => { h.calls.push(`add ${id} ${uri}`); return { position: 1 }; });
  h.read.mockImplementation(async (id: string) => { h.calls.push(`read ${id}`); });
  h.remove.mockResolvedValue({ ok: true });
});

describe("sendInvoice", () => {
  it("sends the pages in order, then starts the read", async () => {
    expect(await sendInvoice([jpg(1), jpg(2), jpg(3)])).toBe("inv1");
    expect(h.calls).toEqual(["start file:///p1.jpg", "add inv1 file:///p2.jpg", "add inv1 file:///p3.jpg", "read inv1"]);
  });

  it("a page that fails to upload deletes the half-sent invoice", async () => {
    h.add.mockRejectedValueOnce(new Error("Network request failed"));
    await expect(sendInvoice([jpg(1), jpg(2)])).rejects.toThrow("Network request failed");
    expect(h.remove).toHaveBeenCalledWith("inv1");
    expect(h.read).not.toHaveBeenCalled();
  });

  it("a failed clean-up never hides the real error", async () => {
    h.read.mockRejectedValueOnce(new Error("offline"));
    h.remove.mockRejectedValueOnce(new Error("still offline"));
    await expect(sendInvoice([jpg(1)])).rejects.toThrow("offline");
  });
});

it("photos are the pages of one invoice; each PDF is its own invoice", () => {
  expect(invoiceBatches([jpg(1), jpg(2)], [pdf(1), pdf(2)])).toEqual([[jpg(1), jpg(2)], [pdf(1)], [pdf(2)]]);
  expect(invoiceBatches([], [pdf(1)])).toEqual([[pdf(1)]]);
});

it("sendInvoices keeps going after a failure and says what did not go", async () => {
  h.start.mockImplementationOnce(async () => ({ id: "inv1", pages: 1 })).mockRejectedValueOnce(new Error("offline"));
  const result = await sendInvoices([[jpg(1)], [pdf(1)]]);
  expect(result.ids).toEqual(["inv1"]);
  expect(result.failed).toEqual([[pdf(1)]]);
  expect(result.error).toBeInstanceOf(Error);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/invoice-upload.test.ts`
Expected: FAIL — `Failed to resolve import "../invoice-upload"`.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/lib/invoice-upload.ts`:

```ts
// Sends what the chef scanned: the photos are the pages of one invoice, and each PDF is an
// invoice of its own. An invoice whose upload breaks halfway is deleted so it never lingers.
import { addInvoicePage, deleteInvoice, startInvoice, startInvoiceRead } from "@/src/api/invoices";
import type { PreparedFile } from "./invoice-image";

export type SendResult = { ids: string[]; failed: Array<ReadonlyArray<PreparedFile>>; error: unknown };

export async function sendInvoice(pages: ReadonlyArray<PreparedFile>): Promise<string> {
  const [first, ...rest] = pages;
  if (!first) throw new Error("invoice_without_pages");
  const { id } = await startInvoice(first.uri, first.mimeType);
  try {
    for (const page of rest) await addInvoicePage(id, page.uri, page.mimeType);
    await startInvoiceRead(id);
  } catch (error) {
    await deleteInvoice(id).catch(() => undefined);
    throw error;
  }
  return id;
}

export function invoiceBatches(photos: ReadonlyArray<PreparedFile>, pdfs: ReadonlyArray<PreparedFile>): PreparedFile[][] {
  return [...(photos.length > 0 ? [[...photos]] : []), ...pdfs.map((pdf) => [pdf])];
}

export async function sendInvoices(batches: ReadonlyArray<ReadonlyArray<PreparedFile>>): Promise<SendResult> {
  const result: SendResult = { ids: [], failed: [], error: null };
  for (const batch of batches) {
    try {
      result.ids.push(await sendInvoice(batch));
    } catch (error) {
      result.failed.push(batch);
      result.error = error;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/invoice-upload.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/invoice-upload.ts apps/mobile/src/lib/__tests__/invoice-upload.test.ts
git commit -m "feat(mobile): send scanned pages as invoices and clean up a broken upload"
```

---

### Task 8: Invoice view rules

**Files:**
- Create: `apps/mobile/src/lib/invoice-view.ts`
- Modify: `packages/i18n/src/{es,it,en}.ts`
- Test: `apps/mobile/src/lib/__tests__/invoice-view.test.ts`

**Interfaces:**
- Consumes: shared `InvoiceStatus`, `InvoiceLineView`, `InvoiceLineAction`, `InvoiceDetail`, `InvoiceSummary`; Task 2 `InvoiceHeaderPatch`.
- Produces:
  - `STATUS_BADGE: Record<InvoiceStatus, { level: StatusLevel; key: TranslationKey }>`
  - `failureKey(reason: string | null): TranslationKey`
  - `ACTION_KEY`, `DONE_KEY: Record<InvoiceLineAction, TranslationKey>`
  - `priceChange(line): { beforeCents: number; afterCents: number; pct: number } | null`
  - `lineState(line): "decided" | "tick" | "probable" | "ambiguous" | "choose"`
  - `undecidedPositions(lines): number[]`
  - `invoiceDay(inv: Pick<InvoiceSummary, "issuedOn" | "createdAt">): string`, `formatDay(day: string, locale: string): string`
  - `parseDayInput(raw): string | null`, `formatDayInput(day): string`
  - `HeaderForm = { supplier: { kind: "existing"; id: string } | { kind: "new"; name: string }; number: string; day: string }`, `buildHeaderPatch(invoice, form): InvoiceHeaderPatch | "invalid_date"`
- Produces i18n keys: `invoice_status_{uploading,reading,review,applied,failed}`, `invoice_failure_{ai_quota,ai_unavailable,unreadable,file_missing,storage_unavailable,not_an_invoice,no_lines,read_timeout,internal_error}`, `invoice_action_{update_price,connect,create_draft,ignore}`, `invoice_done_{update_price,connect,create_draft,ignore}`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/__tests__/invoice-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { InvoiceLineView } from "@atelier/shared";
import {
  buildHeaderPatch, failureKey, formatDay, formatDayInput, invoiceDay, lineState, parseDayInput, priceChange, undecidedPositions,
} from "../invoice-view";

const line = (over: Partial<InvoiceLineView> = {}): InvoiceLineView => ({
  position: 0, description: "Zucchine", code: null, quantity: 2, unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 180, taxRatePct: 4, lineTotalCents: 360, matchLevel: "exact", action: "update_price", appliedPriceCents: 180,
  product: { id: "p1", name: "Zucchine", unidadCompra: "kg", precioCompra: 150, taxRatePct: 4 },
  siblings: [], quantityLooksMisread: false, ...over,
});

describe("priceChange", () => {
  it("compares the bank price with the new one", () => {
    expect(priceChange(line())).toEqual({ beforeCents: 150, afterCents: 180, pct: 20 });
  });
  it("has nothing to compare without a product, a price or a previous price", () => {
    expect(priceChange(line({ product: null }))).toBeNull();
    expect(priceChange(line({ appliedPriceCents: null }))).toBeNull();
    expect(priceChange(line({ product: { id: "p1", name: "Z", unidadCompra: "kg", precioCompra: 0, taxRatePct: 0 } }))).toBeNull();
  });
});

describe("lineState", () => {
  it.each([
    [{}, "decided"],
    [{ action: null, matchLevel: "ambiguo" as const, product: null }, "ambiguous"],
    [{ action: null, matchLevel: "probable" as const }, "probable"],
    [{ action: null }, "tick"],
    [{ action: null, product: null }, "choose"],
  ])("%j is %s", (over, state) => expect(lineState(line(over))).toBe(state));

  it("counts the undecided lines", () => {
    expect(undecidedPositions([line(), line({ position: 3, action: null })])).toEqual([3]);
  });
});

it("an unknown failure reason reads as a generic one", () => {
  expect(failureKey("ai_quota")).toBe("invoice_failure_ai_quota");
  expect(failureKey("something_new")).toBe("invoice_failure_internal_error");
  expect(failureKey(null)).toBe("invoice_failure_internal_error");
});

describe("days", () => {
  it("uses the printed day, else the upload day", () => {
    expect(invoiceDay({ issuedOn: "2026-10-10", createdAt: "2026-10-11T08:00:00.000Z" })).toBe("2026-10-10");
    expect(invoiceDay({ issuedOn: null, createdAt: "2026-10-11T08:00:00.000Z" })).toBe("2026-10-11");
    expect(formatDay("2026-10-10", "es-ES")).toBe("10/10/2026");
  });

  it.each([["15/10/2026", "2026-10-15"], ["5.3.2026", "2026-03-05"], ["31/02/2026", null], ["2026-10-15", null], ["", null]])(
    "reads %j as %j", (raw, day) => expect(parseDayInput(raw)).toBe(day));

  it("writes a day the way the chef types it", () => expect(formatDayInput("2026-03-05")).toBe("05/03/2026"));
});

describe("buildHeaderPatch", () => {
  const invoice = { supplier: { id: "s1", name: "Recchioni" }, number: "77", issuedOn: "2026-10-10" };
  const same = { supplier: { kind: "existing" as const, id: "s1" }, number: "77", day: "10/10/2026" };

  it("sends nothing when nothing changed", () => expect(buildHeaderPatch(invoice, same)).toEqual({}));
  it("sends only what changed", () => {
    expect(buildHeaderPatch(invoice, { ...same, supplier: { kind: "existing", id: "s2" }, number: " 78 " })).toEqual({ supplierId: "s2", number: "78" });
    expect(buildHeaderPatch(invoice, { ...same, supplier: { kind: "new", name: " Garden Fruit " } })).toEqual({ supplierName: "Garden Fruit" });
    expect(buildHeaderPatch(invoice, { ...same, number: "", day: "" })).toEqual({ number: null, issuedOn: null });
    expect(buildHeaderPatch(invoice, { ...same, day: "11/10/2026" })).toEqual({ issuedOn: "2026-10-11" });
  });
  it("a day that does not exist is refused", () => expect(buildHeaderPatch(invoice, { ...same, day: "32/10/2026" })).toBe("invalid_date"));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/invoice-view.test.ts`
Expected: FAIL — `Failed to resolve import "../invoice-view"`.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/lib/invoice-view.ts`:

```ts
// How an invoice and its lines read on screen: badges, plain failure reasons, the price
// before → after, what each undecided line still needs, and the header form's days.
import type { InvoiceDetail, InvoiceHeaderPatch, InvoiceLineAction, InvoiceLineView, InvoiceStatus, InvoiceSummary } from "@atelier/shared";
import type { TranslationKey } from "@atelier/i18n";
import type { StatusLevel } from "@/src/components/StatusBadge";

export const STATUS_BADGE: Record<InvoiceStatus, { level: StatusLevel; key: TranslationKey }> = {
  uploading: { level: "info", key: "invoice_status_uploading" },
  reading: { level: "info", key: "invoice_status_reading" },
  review: { level: "warning", key: "invoice_status_review" },
  applied: { level: "ok", key: "invoice_status_applied" },
  failed: { level: "error", key: "invoice_status_failed" },
};

const FAILURE_KEY: Record<string, TranslationKey> = {
  ai_quota: "invoice_failure_ai_quota",
  ai_unavailable: "invoice_failure_ai_unavailable",
  unreadable: "invoice_failure_unreadable",
  file_missing: "invoice_failure_file_missing",
  storage_unavailable: "invoice_failure_storage_unavailable",
  not_an_invoice: "invoice_failure_not_an_invoice",
  no_lines: "invoice_failure_no_lines",
  read_timeout: "invoice_failure_read_timeout",
  internal_error: "invoice_failure_internal_error",
};
export const failureKey = (reason: string | null): TranslationKey =>
  (reason ? FAILURE_KEY[reason] : undefined) ?? "invoice_failure_internal_error";

export const ACTION_KEY: Record<InvoiceLineAction, TranslationKey> = {
  update_price: "invoice_action_update_price",
  connect: "invoice_action_connect",
  create_draft: "invoice_action_create_draft",
  ignore: "invoice_action_ignore",
};
export const DONE_KEY: Record<InvoiceLineAction, TranslationKey> = {
  update_price: "invoice_done_update_price",
  connect: "invoice_done_connect",
  create_draft: "invoice_done_create_draft",
  ignore: "invoice_done_ignore",
};

// The product's bank price against the one this invoice brings, both in the product's unit.
export function priceChange(line: InvoiceLineView): { beforeCents: number; afterCents: number; pct: number } | null {
  if (!line.product || line.appliedPriceCents === null || line.product.precioCompra <= 0) return null;
  const before = line.product.precioCompra;
  const after = line.appliedPriceCents;
  return { beforeCents: before, afterCents: after, pct: Math.round(((after - before) / before) * 100) };
}

// What an undecided line waits for: a variant to pick, a probable match to confirm, a big
// price change to tick (20 % or more is never applied silently), or a product to choose.
export type LineState = "decided" | "tick" | "probable" | "ambiguous" | "choose";
export function lineState(line: InvoiceLineView): LineState {
  if (line.action !== null) return "decided";
  if (line.matchLevel === "ambiguo") return "ambiguous";
  if (line.matchLevel === "probable" && line.product) return "probable";
  if (line.product && line.appliedPriceCents !== null) return "tick";
  return "choose";
}

export const undecidedPositions = (lines: ReadonlyArray<InvoiceLineView>) => lines.filter((l) => l.action === null).map((l) => l.position);

export const invoiceDay = (inv: Pick<InvoiceSummary, "issuedOn" | "createdAt">) => inv.issuedOn ?? inv.createdAt.slice(0, 10);
export const formatDay = (day: string, locale: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC" });

// "15/10/2026", "5.3.2026" or "5-3-2026" → "2026-10-15"; a day that does not exist → null.
export function parseDayInput(raw: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const day = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === day ? day : null;
}
export const formatDayInput = (day: string) => day.split("-").reverse().join("/");

export type HeaderForm = { supplier: { kind: "existing"; id: string } | { kind: "new"; name: string }; number: string; day: string };

// Only what the chef changed goes to the server.
export function buildHeaderPatch(
  invoice: Pick<InvoiceDetail, "supplier" | "number" | "issuedOn">,
  form: HeaderForm,
): InvoiceHeaderPatch | "invalid_date" {
  const patch: InvoiceHeaderPatch = {};
  if (form.supplier.kind === "existing" && form.supplier.id !== invoice.supplier?.id) patch.supplierId = form.supplier.id;
  if (form.supplier.kind === "new" && form.supplier.name.trim() !== "") patch.supplierName = form.supplier.name.trim();
  const number = form.number.trim();
  if (number !== (invoice.number ?? "")) patch.number = number === "" ? null : number;
  const rawDay = form.day.trim();
  const day = rawDay === "" ? null : parseDayInput(rawDay);
  if (rawDay !== "" && day === null) return "invalid_date";
  if (day !== invoice.issuedOn) patch.issuedOn = day;
  return patch;
}
```

- [ ] **Step 4: Add the copy**

`packages/i18n/src/es.ts`:

```ts
  invoice_status_uploading: "Subiendo",
  invoice_status_reading: "Leyendo",
  invoice_status_review: "Por revisar",
  invoice_status_applied: "Aplicada",
  invoice_status_failed: "Error",
  invoice_failure_ai_quota: "Has usado todas las lecturas con IA de esta semana.",
  invoice_failure_ai_unavailable: "El servicio de lectura no responde. Inténtalo de nuevo en unos minutos.",
  invoice_failure_unreadable: "La foto no se lee bien. Hazla con más luz y con la página entera.",
  invoice_failure_file_missing: "Falta el archivo original. Escanéala de nuevo.",
  invoice_failure_storage_unavailable: "No se pudo abrir el archivo. Inténtalo de nuevo en unos minutos.",
  invoice_failure_not_an_invoice: "No parece una factura.",
  invoice_failure_no_lines: "No se encontró ninguna línea de producto.",
  invoice_failure_read_timeout: "La lectura tardó demasiado. Inténtalo de nuevo.",
  invoice_failure_internal_error: "Algo falló al leerla. Inténtalo de nuevo.",
  invoice_action_update_price: "Actualizar precio",
  invoice_action_connect: "Solo vincular",
  invoice_action_create_draft: "Crear producto",
  invoice_action_ignore: "Ignorar",
  invoice_done_update_price: "Precio actualizado",
  invoice_done_connect: "Vinculada",
  invoice_done_create_draft: "Producto creado",
  invoice_done_ignore: "Ignorada",
```

`packages/i18n/src/it.ts`:

```ts
  invoice_status_uploading: "Caricamento",
  invoice_status_reading: "In lettura",
  invoice_status_review: "Da rivedere",
  invoice_status_applied: "Applicata",
  invoice_status_failed: "Errore",
  invoice_failure_ai_quota: "Hai usato tutte le letture IA di questa settimana.",
  invoice_failure_ai_unavailable: "Il servizio di lettura non risponde. Riprova tra qualche minuto.",
  invoice_failure_unreadable: "La foto non si legge bene. Rifalla con più luce e con la pagina intera.",
  invoice_failure_file_missing: "Manca il file originale. Scansionala di nuovo.",
  invoice_failure_storage_unavailable: "Non è stato possibile aprire il file. Riprova tra qualche minuto.",
  invoice_failure_not_an_invoice: "Non sembra una fattura.",
  invoice_failure_no_lines: "Non è stata trovata nessuna riga di prodotto.",
  invoice_failure_read_timeout: "La lettura ha richiesto troppo tempo. Riprova.",
  invoice_failure_internal_error: "Qualcosa è andato storto durante la lettura. Riprova.",
  invoice_action_update_price: "Aggiorna prezzo",
  invoice_action_connect: "Collega soltanto",
  invoice_action_create_draft: "Crea prodotto",
  invoice_action_ignore: "Ignora",
  invoice_done_update_price: "Prezzo aggiornato",
  invoice_done_connect: "Collegata",
  invoice_done_create_draft: "Prodotto creato",
  invoice_done_ignore: "Ignorata",
```

`packages/i18n/src/en.ts`:

```ts
  invoice_status_uploading: "Uploading",
  invoice_status_reading: "Reading",
  invoice_status_review: "To review",
  invoice_status_applied: "Applied",
  invoice_status_failed: "Failed",
  invoice_failure_ai_quota: "You have used all of this week's AI reads.",
  invoice_failure_ai_unavailable: "The reading service is not responding. Try again in a few minutes.",
  invoice_failure_unreadable: "The photo cannot be read. Retake it with more light and the whole page.",
  invoice_failure_file_missing: "The original file is missing. Scan it again.",
  invoice_failure_storage_unavailable: "The file could not be opened. Try again in a few minutes.",
  invoice_failure_not_an_invoice: "This does not look like an invoice.",
  invoice_failure_no_lines: "No product line was found.",
  invoice_failure_read_timeout: "Reading took too long. Try again.",
  invoice_failure_internal_error: "Something went wrong while reading it. Try again.",
  invoice_action_update_price: "Update price",
  invoice_action_connect: "Link only",
  invoice_action_create_draft: "Create product",
  invoice_action_ignore: "Ignore",
  invoice_done_update_price: "Price updated",
  invoice_done_connect: "Linked",
  invoice_done_create_draft: "Product created",
  invoice_done_ignore: "Ignored",
```

- [ ] **Step 5: Run the test and typecheck**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/invoice-view.test.ts`
Expected: PASS.
Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/invoice-view.ts apps/mobile/src/lib/__tests__/invoice-view.test.ts packages/i18n/src
git commit -m "feat(mobile): invoice view rules, statuses and failure reasons"
```

---

### Task 9: Poll while an invoice is being read

**Files:**
- Create: `apps/mobile/src/hooks/usePolling.ts`
- Test: `apps/mobile/src/hooks/__tests__/usePolling.test.ts`

**Interfaces:**
- Produces: `usePolling(active: boolean, tick: () => void, intervalMs = POLL_MS): void`, `POLL_MS = 4000`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/hooks/__tests__/usePolling.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  tick: vi.fn(),
  remove: vi.fn(),
  listener: null as ((state: string) => void) | null,
  appState: { currentState: "active" },
}));
vi.mock("react-native", () => ({
  AppState: Object.assign(h.appState, {
    addEventListener: (_: string, fn: (state: string) => void) => { h.listener = fn; return { remove: h.remove }; },
  }),
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]) };
});

import { usePolling } from "../usePolling";

function Probe({ active }: { active: boolean }) {
  usePolling(active, h.tick, 1000);
  return null;
}
let tree: ReactTestRenderer;
const render = async (active: boolean) => { await act(async () => { tree = create(createElement(Probe, { active })); }); };

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.appState.currentState = "active";
});
afterEach(() => vi.useRealTimers());

describe("usePolling", () => {
  it("ticks every interval while active", async () => {
    await render(true);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(h.tick).toHaveBeenCalledTimes(3);
  });

  it("never ticks while inactive", async () => {
    await render(false);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(h.tick).not.toHaveBeenCalled();
  });

  it("stops when the screen goes away", async () => {
    await render(true);
    await act(async () => { tree.unmount(); });
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(h.tick).not.toHaveBeenCalled();
    expect(h.remove).toHaveBeenCalled();
  });

  it("pauses in the background and refreshes once on return", async () => {
    await render(true);
    await act(async () => { h.listener?.("background"); vi.advanceTimersByTime(5000); });
    expect(h.tick).not.toHaveBeenCalled();
    await act(async () => { h.listener?.("active"); });
    expect(h.tick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter mobile exec vitest run src/hooks/__tests__/usePolling.test.ts`
Expected: FAIL — `Failed to resolve import "../usePolling"`.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/hooks/usePolling.ts`:

```ts
// Calls `tick` every few seconds while `active`, only while the screen is focused and the app
// is in the foreground; coming back to the foreground refreshes at once. Used while an
// invoice is being read.
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

export const POLL_MS = 4000;

export function usePolling(active: boolean, tick: () => void, intervalMs = POLL_MS): void {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useFocusEffect(
    useCallback(() => {
      if (!active) return undefined;
      let foreground = AppState.currentState === "active";
      const subscription = AppState.addEventListener("change", (state) => {
        const returning = state === "active" && !foreground;
        foreground = state === "active";
        if (returning) tickRef.current();
      });
      const timer = setInterval(() => {
        if (foreground) tickRef.current();
      }, intervalMs);
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, [active, intervalMs]),
  );
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter mobile exec vitest run src/hooks/__tests__/usePolling.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/usePolling.ts apps/mobile/src/hooks/__tests__/usePolling.test.ts
git commit -m "feat(mobile): focus-aware polling hook"
```

---

### Task 10: Casa entry and the invoice list

**Files:**
- Modify: `apps/mobile/app/(tabs)/casa.tsx:350-370`
- Create: `apps/mobile/app/facturas/index.tsx`
- Modify: `packages/i18n/src/{es,it,en}.ts`
- Test: `apps/mobile/src/__tests__/restaurant-photo.test.ts` (Casa), `apps/mobile/src/__tests__/invoices-list.test.ts`

**Interfaces:**
- Consumes: Task 5 `listInvoices`; Task 8 `STATUS_BADGE`, `invoiceDay`, `formatDay`; Task 9 `usePolling`.
- Produces: route `/facturas` (list) — pushes `/facturas/escanear` and `/facturas/<id>`.
- Produces i18n keys: `casa_facturas_entry_title`, `casa_facturas_entry_sub`, `invoices_title`, `invoices_scan`, `invoices_to_review`, `invoices_empty_title`, `invoices_empty_sub`, `invoices_no_supplier`, `invoices_no_number`.

- [ ] **Step 1: Write the failing tests**

In `apps/mobile/src/__tests__/restaurant-photo.test.ts`:
- add `push: vi.fn(),` to the `h` object;
- change the router mock to `vi.mock("expo-router", () => ({ useRouter: () => ({ push: h.push }) }));`
- change the shared mock to `vi.mock("@atelier/shared", () => ({ can: (role: string, permission: string) => role === "admin" && ["edit_restaurant", "manage_products"].includes(permission) }));`
- add inside `describe("Casa restaurant photo")`:

```ts
  it("opens the supplier invoices to who manages products", async () => {
    await render();
    const entry = () => screen.root.findAllByType("Pressable" as never).find((node) => node.props.accessibilityLabel === "casa_facturas_entry_title");
    await act(async () => { entry()?.props.onPress(); });
    expect(h.push).toHaveBeenCalledWith("/facturas");
    await act(async () => { screen.unmount(); });
    h.role = "viewer";
    await render();
    expect(entry()).toBeUndefined();
  });
```

Create `apps/mobile/src/__tests__/invoices-list.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { InvoiceListResponse, InvoiceSummary } from "@atelier/shared";

const h = vi.hoisted(() => ({ list: vi.fn(), push: vi.fn(), polling: null as boolean | null }));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { useRouter: () => ({ push: h.push, back: vi.fn() }), useFocusEffect: (fn: () => void) => useEffect(fn, [fn]) };
});
vi.mock("@/src/hooks/useI18n", () => ({
  useI18n: () => ({ lang: "es", t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
  dateLocale: () => "es-ES",
}));
vi.mock("@/src/hooks/usePolling", () => ({ usePolling: (active: boolean) => { h.polling = active; } }));
vi.mock("@/src/api/invoices", () => ({ listInvoices: h.list }));
vi.mock("@/src/components/Screen", () => ({ Screen: "Screen" }));
vi.mock("@/src/components/Button", () => ({ Button: "Button" }));
vi.mock("@/src/components/Empty", () => ({ Empty: "Empty" }));
vi.mock("@/src/components/NetworkError", () => ({ NetworkError: "NetworkError" }));
vi.mock("@/src/components/StatusBadge", () => ({ StatusBadge: "StatusBadge" }));

import InvoicesScreen from "../../app/facturas/index";

const summary = (over: Partial<InvoiceSummary>): InvoiceSummary => ({
  id: "i1", status: "review", number: "77", issuedOn: "2026-10-10", grossTotalCents: 2288, netTotalCents: 2200,
  failureReason: null, createdAt: "2026-10-11T08:00:00.000Z", ...over,
});
const response = (over: Partial<InvoiceListResponse> = {}): InvoiceListResponse => ({
  toReview: 1,
  suppliers: [
    { supplier: { id: "s1", name: "Recchioni" }, invoices: [summary({})] },
    { supplier: null, invoices: [summary({ id: "i2", status: "reading", number: null, issuedOn: null, grossTotalCents: null })] },
  ],
  ...over,
});

let screen: ReactTestRenderer;
const texts = () => screen.root.findAllByType("Text" as never).map((n) => n.children.join(""));
const byLabel = (type: string, label: string) => screen.root.findAllByType(type as never).find((n) => n.props.label === label);
async function render() { await act(async () => { screen = create(createElement(InvoicesScreen)); }); }

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.polling = null;
  h.list.mockResolvedValue(response());
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("invoice list", () => {
  it("groups by supplier with day, number, total and status", async () => {
    await render();
    expect(texts()).toEqual(expect.arrayContaining(["Recchioni", "10/10/2026", "77", "22,88 €", "invoices_no_supplier", "11/10/2026", "invoices_no_number"]));
    expect(screen.root.findAllByType("StatusBadge" as never).map((n) => n.props.label)).toEqual(["invoice_status_review", "invoice_status_reading"]);
  });

  it("counts the invoices waiting for review, and hides the band when none", async () => {
    await render();
    expect(texts()).toContain('invoices_to_review:{"count":1}');
    await act(async () => { screen.unmount(); });
    h.list.mockResolvedValue(response({ toReview: 0 }));
    await render();
    expect(texts().some((s) => s.startsWith("invoices_to_review"))).toBe(false);
  });

  it("refreshes by itself only while an invoice is being read", async () => {
    await render();
    expect(h.polling).toBe(true);
    await act(async () => { screen.unmount(); });
    h.list.mockResolvedValue(response({ suppliers: [{ supplier: null, invoices: [summary({ status: "applied" })] }] }));
    await render();
    expect(h.polling).toBe(false);
  });

  it("opens the scanner and each invoice", async () => {
    await render();
    await act(async () => { byLabel("Button", "invoices_scan")?.props.onPress(); });
    expect(h.push).toHaveBeenCalledWith("/facturas/escanear");
    const row = screen.root.findAllByType("Pressable" as never).find((n) => n.props.accessibilityLabel === "Recchioni 77");
    await act(async () => { row?.props.onPress(); });
    expect(h.push).toHaveBeenCalledWith("/facturas/i1");
  });

  it("offers scanning when empty, and retry when offline", async () => {
    h.list.mockResolvedValue(response({ toReview: 0, suppliers: [] }));
    await render();
    expect(screen.root.findByType("Empty" as never).props.actionLabel).toBe("invoices_scan");
    await act(async () => { screen.unmount(); });
    h.list.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(response());
    await render();
    await act(async () => { screen.root.findByType("NetworkError" as never).props.onRetry(); });
    expect(texts()).toContain("Recchioni");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter mobile exec vitest run src/__tests__/restaurant-photo.test.ts src/__tests__/invoices-list.test.ts`
Expected: FAIL — no Casa entry labelled `casa_facturas_entry_title`; `Failed to resolve import "../../app/facturas/index"`.

- [ ] **Step 3: Add the Casa entry**

In `apps/mobile/app/(tabs)/casa.tsx`, right after the Banco `<Pressable>…</Pressable>` inside the same `{canBanco ? (…) : null}` — wrap both in a fragment:

```tsx
        {canBanco ? (
          <>
            <Pressable
              style={styles.bancoEntry}
              onPress={() =>
                // … (existing comment and push stay as they are)
                router.push("/productos" as never)
              }
            >
              {/* existing Banco content unchanged */}
            </Pressable>
            <Pressable
              style={styles.bancoEntry}
              accessibilityRole="button"
              accessibilityLabel={t("casa_facturas_entry_title")}
              // Folder index route: push "/facturas", never "/facturas/index" (see the Banco note).
              onPress={() => router.push("/facturas" as never)}
            >
              <View style={styles.bancoIcon}>
                <Ionicons name="receipt-outline" size={20} color={colors.terracota} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bancoTitle}>{t("casa_facturas_entry_title")}</Text>
                <Text style={styles.bancoSub}>{t("casa_facturas_entry_sub")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mute} />
            </Pressable>
          </>
        ) : null}
```

- [ ] **Step 4: Write the list screen**

Create `apps/mobile/app/facturas/index.tsx`:

```tsx
// Supplier invoices, newest first, grouped by supplier. A band counts the ones waiting for
// review; the list refreshes by itself while any invoice is being read.
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { InvoiceListResponse } from "@atelier/shared";
import { listInvoices } from "@/src/api/invoices";
import { Button } from "@/src/components/Button";
import { Empty } from "@/src/components/Empty";
import { NetworkError } from "@/src/components/NetworkError";
import { Screen } from "@/src/components/Screen";
import { StatusBadge } from "@/src/components/StatusBadge";
import { usePolling } from "@/src/hooks/usePolling";
import { dateLocale, useI18n } from "@/src/hooks/useI18n";
import { formatDay, invoiceDay, STATUS_BADGE } from "@/src/lib/invoice-view";
import { formatEuros } from "@/src/lib/money";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function InvoicesScreen() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [data, setData] = useState<InvoiceListResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await listInvoices());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const reading = data?.suppliers.some((g) => g.invoices.some((i) => i.status === "reading" || i.status === "uploading")) ?? false;
  usePolling(reading, () => { void reload(); });

  const scan = () => router.push("/facturas/escanear" as never);

  let body: React.ReactNode;
  if (!data) {
    body = failed ? <NetworkError onRetry={() => void reload()} /> : <ActivityIndicator color={colors.teal} style={styles.loading} />;
  } else if (data.suppliers.length === 0) {
    body = <Empty icon="receipt-outline" title={t("invoices_empty_title")} sub={t("invoices_empty_sub")} actionLabel={t("invoices_scan")} onAction={scan} />;
  } else {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <Button label={t("invoices_scan")} iconLeft="camera-outline" onPress={scan} />
        {data.toReview > 0 ? (
          <View style={styles.band}>
            <Text style={styles.bandText}>{t("invoices_to_review", { count: data.toReview })}</Text>
          </View>
        ) : null}
        {data.suppliers.map((group) => (
          <View key={group.supplier?.id ?? "none"} style={styles.group}>
            <Text style={styles.supplier}>{group.supplier?.name ?? t("invoices_no_supplier")}</Text>
            {group.invoices.map((invoice) => {
              const badge = STATUS_BADGE[invoice.status];
              const total = invoice.grossTotalCents ?? invoice.netTotalCents;
              return (
                <Pressable
                  key={invoice.id}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.supplier?.name ?? t("invoices_no_supplier")} ${invoice.number ?? t("invoices_no_number")}`}
                  onPress={() => router.push(`/facturas/${invoice.id}` as never)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.number}>{invoice.number ?? t("invoices_no_number")}</Text>
                    <Text style={styles.day}>{formatDay(invoiceDay(invoice), dateLocale(lang))}</Text>
                  </View>
                  {total !== null ? <Text style={styles.total}>{formatEuros(total)}</Text> : null}
                  <StatusBadge level={badge.level} label={t(badge.key)} />
                  <Ionicons name="chevron-forward" size={16} color={colors.mute} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <Screen title={t("invoices_title")} back onBack={() => router.back()}>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xxl },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  band: { backgroundColor: colors.terracotaSoft, borderRadius: radii.md, padding: spacing.md },
  bandText: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  group: { gap: spacing.xs },
  supplier: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifBody, color: colors.ink, marginTop: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.paperSoft,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.edgeSoft, padding: spacing.md,
  },
  number: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  day: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  total: { fontFamily: fonts.mono, fontSize: fontSizes.bodySm, color: colors.inkSoft },
});
```

- [ ] **Step 5: Add the copy**

`packages/i18n/src/es.ts`:

```ts
  casa_facturas_entry_title: "Facturas",
  casa_facturas_entry_sub: "Escanea facturas de proveedores y actualiza los precios",
  invoices_title: "Facturas",
  invoices_scan: "Escanear factura",
  invoices_to_review: "Por revisar ({count})",
  invoices_empty_title: "Todavía no hay facturas",
  invoices_empty_sub: "Escanea una factura de un proveedor y Atelier te propone los precios nuevos.",
  invoices_no_supplier: "Proveedor sin leer",
  invoices_no_number: "Sin número",
```

`packages/i18n/src/it.ts`:

```ts
  casa_facturas_entry_title: "Fatture",
  casa_facturas_entry_sub: "Scansiona le fatture dei fornitori e aggiorna i prezzi",
  invoices_title: "Fatture",
  invoices_scan: "Scansiona fattura",
  invoices_to_review: "Da rivedere ({count})",
  invoices_empty_title: "Ancora nessuna fattura",
  invoices_empty_sub: "Scansiona una fattura di un fornitore e Atelier ti propone i nuovi prezzi.",
  invoices_no_supplier: "Fornitore non letto",
  invoices_no_number: "Senza numero",
```

`packages/i18n/src/en.ts`:

```ts
  casa_facturas_entry_title: "Invoices",
  casa_facturas_entry_sub: "Scan supplier invoices and update prices",
  invoices_title: "Invoices",
  invoices_scan: "Scan invoice",
  invoices_to_review: "To review ({count})",
  invoices_empty_title: "No invoices yet",
  invoices_empty_sub: "Scan a supplier invoice and Atelier proposes the new prices.",
  invoices_no_supplier: "Supplier not read",
  invoices_no_number: "No number",
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm --filter mobile exec vitest run src/__tests__/restaurant-photo.test.ts src/__tests__/invoices-list.test.ts`
Expected: PASS.
Run: `pnpm typecheck`
Expected: no errors (typed routes regenerate with `/facturas`).

- [ ] **Step 7: Commit**

```bash
git add "apps/mobile/app/(tabs)/casa.tsx" apps/mobile/app/facturas/index.tsx apps/mobile/src/__tests__/restaurant-photo.test.ts apps/mobile/src/__tests__/invoices-list.test.ts packages/i18n/src
git commit -m "feat(mobile): invoices entry in Casa and the invoice list"
```

---

### Task 11: The scanner

**Files:**
- Create: `apps/mobile/app/facturas/escanear.tsx`
- Modify: `apps/mobile/app.json:39-42` (`expo-image-picker` permission texts)
- Modify: `packages/i18n/src/{es,it,en}.ts`
- Test: `apps/mobile/src/__tests__/invoice-scan.test.ts`

**Interfaces:**
- Consumes: Task 6 `prepareInvoiceFile`, `InvoiceFileTooLargeError`, `PickedFile`, `PreparedFile`; Task 7 `invoiceBatches`, `sendInvoices`.
- Produces: route `/facturas/escanear`; after sending one invoice it replaces itself with `/facturas/<id>`, after several it goes back to the list.
- Produces i18n keys: `invoice_scan_title`, `invoice_scan_hint`, `invoice_scan_camera`, `invoice_scan_add_page`, `invoice_scan_gallery`, `invoice_scan_pdf`, `invoice_scan_page`, `invoice_scan_done`, `invoice_scan_sending`, `invoice_scan_remove_page`, `invoice_scan_partial`, `invoice_scan_prepare_failed`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/__tests__/invoice-scan.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  cameraPermission: vi.fn(), galleryPermission: vi.fn(), camera: vi.fn(), gallery: vi.fn(), document: vi.fn(),
  prepare: vi.fn(), send: vi.fn(), replace: vi.fn(), back: vi.fn(), toast: vi.fn(),
}));

vi.mock("react-native", () => ({
  Image: "Image", Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace: h.replace, back: h.back }) }));
vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: h.cameraPermission, requestMediaLibraryPermissionsAsync: h.galleryPermission,
  launchCameraAsync: h.camera, launchImageLibraryAsync: h.gallery,
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: h.document }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }) }));
vi.mock("@/src/lib/invoice-image", () => {
  class InvoiceFileTooLargeError extends Error {}
  return { prepareInvoiceFile: h.prepare, InvoiceFileTooLargeError };
});
vi.mock("@/src/lib/invoice-upload", () => ({
  sendInvoices: h.send,
  invoiceBatches: (photos: unknown[], pdfs: unknown[]) => [...(photos.length ? [photos] : []), ...pdfs.map((p) => [p])],
}));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "error_network" }));
vi.mock("@/src/components/Screen", () => ({ Screen: "Screen" }));
vi.mock("@/src/components/Button", () => ({ Button: "Button" }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));

import { InvoiceFileTooLargeError } from "@/src/lib/invoice-image";
import ScanInvoiceScreen from "../../app/facturas/escanear";

let screen: ReactTestRenderer;
const button = (label: string) => screen.root.findAllByType("Button" as never).find((n) => n.props.label === label);
const press = async (label: string) => { await act(async () => { await button(label)?.props.onPress(); }); };
const pages = () => screen.root.findAllByType("Image" as never).map((n) => n.props.source.uri);
async function render() { await act(async () => { screen = create(createElement(ScanInvoiceScreen)); }); }
let shot = 0;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  shot = 0;
  h.cameraPermission.mockResolvedValue({ granted: true });
  h.galleryPermission.mockResolvedValue({ granted: true });
  h.camera.mockImplementation(async () => ({ canceled: false, assets: [{ uri: `file:///raw${++shot}.jpg`, mimeType: "image/jpeg", width: 4000, height: 3000 }] }));
  h.prepare.mockImplementation(async (file: { uri: string; mimeType?: string }) => ({
    uri: file.uri.replace("raw", "ready"), mimeType: file.mimeType === "application/pdf" ? "application/pdf" : "image/jpeg",
  }));
  h.send.mockResolvedValue({ ids: ["inv1"], failed: [], error: null });
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("scanner", () => {
  it("several photos are the pages of one invoice, which opens when sent", async () => {
    await render();
    await press("invoice_scan_camera");
    await press("invoice_scan_add_page");
    expect(pages()).toEqual(["file:///ready1.jpg", "file:///ready2.jpg"]);
    await press("invoice_scan_done");
    expect(h.send).toHaveBeenCalledWith([[{ uri: "file:///ready1.jpg", mimeType: "image/jpeg" }, { uri: "file:///ready2.jpg", mimeType: "image/jpeg" }]]);
    expect(h.replace).toHaveBeenCalledWith("/facturas/inv1");
  });

  it("each PDF is its own invoice, and several go back to the list", async () => {
    h.document.mockResolvedValue({ canceled: false, assets: [
      { uri: "file:///raw-a.pdf", mimeType: "application/pdf", name: "a.pdf", size: 1000 },
      { uri: "file:///raw-b.pdf", mimeType: "application/pdf", name: "b.pdf", size: 1000 },
    ] });
    h.send.mockResolvedValue({ ids: ["inv1", "inv2"], failed: [], error: null });
    await render();
    await press("invoice_scan_pdf");
    await press("invoice_scan_done");
    expect(h.send.mock.calls[0]![0]).toHaveLength(2);
    expect(h.back).toHaveBeenCalled();
  });

  it("without camera permission nothing is opened", async () => {
    h.cameraPermission.mockResolvedValue({ granted: false });
    await render();
    await press("invoice_scan_camera");
    expect(h.camera).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith("cargar_permiso_camara", "error");
  });

  it("a file that cannot fit is explained and not added", async () => {
    h.prepare.mockRejectedValueOnce(new InvoiceFileTooLargeError());
    await render();
    await press("invoice_scan_camera");
    expect(pages()).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith("invoice_file_too_large", "error");
  });

  it("never more than 10 pages", async () => {
    h.gallery.mockResolvedValue({ canceled: false, assets: Array.from({ length: 11 }, (_, i) => ({ uri: `file:///raw-g${i}.jpg`, mimeType: "image/jpeg" })) });
    await render();
    await press("invoice_scan_gallery");
    expect(pages()).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith("invoice_scan_too_many_pages", "error");
  });

  it("keeps what was not sent so the chef can send it again", async () => {
    h.send.mockResolvedValue({ ids: [], failed: [[{ uri: "file:///ready1.jpg", mimeType: "image/jpeg" }]], error: new Error("offline") });
    await render();
    await press("invoice_scan_camera");
    await press("invoice_scan_done");
    expect(pages()).toEqual(["file:///ready1.jpg"]);
    expect(h.toast).toHaveBeenCalledWith("error_network", "error");
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("a page can be removed before sending", async () => {
    await render();
    await press("invoice_scan_camera");
    const remove = screen.root.findAllByType("Pressable" as never).find((n) => n.props.accessibilityLabel === "invoice_scan_remove_page");
    await act(async () => { remove?.props.onPress(); });
    expect(pages()).toEqual([]);
    expect(button("invoice_scan_done")?.props.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter mobile exec vitest run src/__tests__/invoice-scan.test.ts`
Expected: FAIL — `Failed to resolve import "../../app/facturas/escanear"`.

- [ ] **Step 3: Write the screen**

Create `apps/mobile/app/facturas/escanear.tsx`:

```tsx
// Scan supplier invoices: photos taken or chosen are the pages of one invoice; each PDF is an
// invoice of its own. Everything is compressed to fit the upload limit before it is shown.
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Button } from "@/src/components/Button";
import { Screen } from "@/src/components/Screen";
import { showToast } from "@/src/components/Toast";
import { useI18n } from "@/src/hooks/useI18n";
import { apiErrorMessage } from "@/src/lib/api-error";
import { InvoiceFileTooLargeError, prepareInvoiceFile, type PickedFile, type PreparedFile } from "@/src/lib/invoice-image";
import { invoiceBatches, sendInvoices } from "@/src/lib/invoice-upload";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const MAX_PAGES = 10;
type Pdf = PreparedFile & { name: string };
const fromImage = (a: ImagePicker.ImagePickerAsset): PickedFile => ({ uri: a.uri, mimeType: a.mimeType, size: a.fileSize, width: a.width, height: a.height });

export default function ScanInvoiceScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [photos, setPhotos] = useState<PreparedFile[]>([]);
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [busy, setBusy] = useState(false);

  const prepareAll = async (files: PickedFile[]): Promise<PreparedFile[] | null> => {
    setBusy(true);
    try {
      const ready: PreparedFile[] = [];
      for (const file of files) ready.push(await prepareInvoiceFile(file));
      return ready;
    } catch (error) {
      showToast(error instanceof InvoiceFileTooLargeError ? t("invoice_file_too_large") : t("invoice_scan_prepare_failed"), "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addPhotos = async (files: PickedFile[]) => {
    if (photos.length + files.length > MAX_PAGES) {
      showToast(t("invoice_scan_too_many_pages"), "error");
      return;
    }
    const ready = await prepareAll(files);
    if (ready) setPhotos((current) => [...current, ...ready]);
  };

  const takePhoto = async () => {
    if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      showToast(t("cargar_permiso_camara"), "error");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!result.canceled) await addPhotos(result.assets.map(fromImage));
  };

  const choosePhotos = async () => {
    if (!(await ImagePicker.requestMediaLibraryPermissionsAsync()).granted) {
      showToast(t("cargar_permiso_galeria"), "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: MAX_PAGES, quality: 0.9,
    });
    if (!result.canceled) await addPhotos(result.assets.map(fromImage));
  };

  const choosePdfs = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const ready = await prepareAll(result.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType ?? "application/pdf", size: a.size })));
    if (ready) setPdfs((current) => [...current, ...ready.map((file, i) => ({ ...file, name: result.assets[i]!.name }))]);
  };

  const send = async () => {
    setBusy(true);
    const batches = invoiceBatches(photos, pdfs);
    const result = await sendInvoices(batches);
    setBusy(false);
    if (result.failed.length === 0) {
      if (result.ids.length === 1) router.replace(`/facturas/${result.ids[0]}` as never);
      else router.back();
      return;
    }
    // Keep only what did not go, so the chef can send it again without scanning twice.
    const unsent = new Set(result.failed.flat().map((file) => file.uri));
    setPhotos((current) => current.filter((file) => unsent.has(file.uri)));
    setPdfs((current) => current.filter((file) => unsent.has(file.uri)));
    showToast(
      result.ids.length > 0 ? t("invoice_scan_partial", { failed: result.failed.length, total: batches.length }) : apiErrorMessage(result.error, t),
      "error",
    );
  };

  const nothing = photos.length === 0 && pdfs.length === 0;
  return (
    <Screen title={t("invoice_scan_title")} back onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>{t("invoice_scan_hint")}</Text>
        <View style={styles.pages}>
          {photos.map((photo, i) => (
            <View key={photo.uri} style={styles.page}>
              <Image source={{ uri: photo.uri }} style={styles.thumb} />
              <Text style={styles.pageLabel}>{t("invoice_scan_page", { n: i + 1 })}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("invoice_scan_remove_page")}
                style={styles.remove}
                onPress={() => setPhotos((current) => current.filter((p) => p.uri !== photo.uri))}
              >
                <Ionicons name="close" size={14} color={colors.paper} />
              </Pressable>
            </View>
          ))}
        </View>
        {pdfs.map((pdf) => (
          <View key={pdf.uri} style={styles.pdf}>
            <Ionicons name="document-outline" size={18} color={colors.inkSoft} />
            <Text style={styles.pdfName} numberOfLines={1}>{pdf.name}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("invoice_scan_remove_page")}
              onPress={() => setPdfs((current) => current.filter((p) => p.uri !== pdf.uri))}
            >
              <Ionicons name="close" size={16} color={colors.mute} />
            </Pressable>
          </View>
        ))}
        <Button
          label={photos.length > 0 ? t("invoice_scan_add_page") : t("invoice_scan_camera")}
          iconLeft="camera-outline"
          variant={photos.length > 0 ? "secondary" : "primary"}
          disabled={busy}
          onPress={takePhoto}
        />
        <Button label={t("invoice_scan_gallery")} iconLeft="images-outline" variant="secondary" disabled={busy} onPress={choosePhotos} />
        <Button label={t("invoice_scan_pdf")} iconLeft="document-outline" variant="secondary" disabled={busy} onPress={choosePdfs} />
        <Button label={busy ? t("invoice_scan_sending") : t("invoice_scan_done")} disabled={busy || nothing} onPress={send} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hint: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft },
  pages: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  page: { width: 96, alignItems: "center", gap: spacing.xs },
  thumb: { width: 96, height: 128, borderRadius: radii.sm, backgroundColor: colors.paperWarm },
  pageLabel: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  remove: { position: "absolute", top: 4, right: 4, backgroundColor: colors.ink, borderRadius: radii.pill, padding: 4 },
  pdf: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.edgeSoft, backgroundColor: colors.paperSoft,
  },
  pdfName: { flex: 1, fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
});
```

- [ ] **Step 4: Permission text and copy**

`apps/mobile/app.json`, in the `expo-image-picker` plugin:

```json
          "photosPermission": "Atelier accede a tu galería para que elijas fotos de perfil, de recetas o de facturas.",
          "cameraPermission": "Atelier usa la cámara para que fotografíes tus recetas y las facturas de tus proveedores."
```

`packages/i18n/src/es.ts`:

```ts
  invoice_scan_title: "Escanear factura",
  invoice_scan_hint: "Haz una foto por página. Cada PDF es una factura.",
  invoice_scan_camera: "Hacer foto",
  invoice_scan_add_page: "Añadir otra página",
  invoice_scan_gallery: "Elegir de la galería",
  invoice_scan_pdf: "Elegir PDF",
  invoice_scan_page: "Página {n}",
  invoice_scan_done: "Listo",
  invoice_scan_sending: "Enviando…",
  invoice_scan_remove_page: "Quitar",
  invoice_scan_partial: "{failed} de {total} facturas no se enviaron. Vuelve a intentarlo.",
  invoice_scan_prepare_failed: "No se pudo preparar el archivo. Inténtalo de nuevo.",
```

`packages/i18n/src/it.ts`:

```ts
  invoice_scan_title: "Scansiona fattura",
  invoice_scan_hint: "Fai una foto per pagina. Ogni PDF è una fattura.",
  invoice_scan_camera: "Scatta foto",
  invoice_scan_add_page: "Aggiungi un'altra pagina",
  invoice_scan_gallery: "Scegli dalla galleria",
  invoice_scan_pdf: "Scegli PDF",
  invoice_scan_page: "Pagina {n}",
  invoice_scan_done: "Fatto",
  invoice_scan_sending: "Invio…",
  invoice_scan_remove_page: "Rimuovi",
  invoice_scan_partial: "{failed} di {total} fatture non sono state inviate. Riprova.",
  invoice_scan_prepare_failed: "Non è stato possibile preparare il file. Riprova.",
```

`packages/i18n/src/en.ts`:

```ts
  invoice_scan_title: "Scan invoice",
  invoice_scan_hint: "Take one photo per page. Each PDF is one invoice.",
  invoice_scan_camera: "Take photo",
  invoice_scan_add_page: "Add another page",
  invoice_scan_gallery: "Choose from gallery",
  invoice_scan_pdf: "Choose PDF",
  invoice_scan_page: "Page {n}",
  invoice_scan_done: "Done",
  invoice_scan_sending: "Sending…",
  invoice_scan_remove_page: "Remove",
  invoice_scan_partial: "{failed} of {total} invoices were not sent. Try again.",
  invoice_scan_prepare_failed: "The file could not be prepared. Try again.",
```

- [ ] **Step 5: Run the test and typecheck**

Run: `pnpm --filter mobile exec vitest run src/__tests__/invoice-scan.test.ts`
Expected: PASS (7 tests).
Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/facturas/escanear.tsx apps/mobile/app.json apps/mobile/src/__tests__/invoice-scan.test.ts packages/i18n/src
git commit -m "feat(mobile): scan invoices from camera, gallery or PDF"
```

---

### Task 12: Line card and product picker

**Files:**
- Create: `apps/mobile/src/components/invoices/InvoiceLineCard.tsx`
- Create: `apps/mobile/src/components/invoices/ProductPickerSheet.tsx`
- Modify: `packages/i18n/src/{es,it,en}.ts`
- Test: `apps/mobile/src/__tests__/invoice-line-card.test.ts`, `apps/mobile/src/__tests__/product-picker-sheet.test.ts`

**Interfaces:**
- Consumes: Task 8 `lineState`, `priceChange`, `ACTION_KEY`, `DONE_KEY`; `listProducts({ q })` from `@/src/api/products`.
- Produces: `InvoiceLineCard({ line: InvoiceLineView; readOnly: boolean; onPatch: (body: InvoiceLinePatch) => void; onChooseProduct: (productId: string) => void })`, `ProductPickerSheet({ open: boolean; onPick: (productId: string) => void; onClose: () => void })`.
- Produces i18n keys: `invoice_line_new_product`, `invoice_line_tax`, `invoice_line_change`, `invoice_line_confirm_big_change`, `invoice_line_choose`, `invoice_line_choose_other`, `invoice_line_probable_title`, `invoice_line_probable_body`, `invoice_line_probable_yes`, `invoice_line_probable_no`, `invoice_line_variant_title`, `invoice_line_variant_body`, `invoice_line_variant_none`, `invoice_warning_quantity`, `invoice_picker_search`, `invoice_picker_empty`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/__tests__/invoice-line-card.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { InvoiceLineView } from "@atelier/shared";

const h = vi.hoisted(() => ({ patch: vi.fn(), choose: vi.fn() }));
vi.mock("react-native", () => ({ Text: "Text", View: "View", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }) }));
for (const name of ["Button", "ChoiceSheet", "ConfirmMatchSheet", "EditableCell", "PickVariantSheet", "StatusBadge"]) {
  vi.doMock(`@/src/components/${name}`, () => ({ [name]: name }));
}
vi.mock("@/src/components/invoices/ProductPickerSheet", () => ({ ProductPickerSheet: "ProductPickerSheet" }));

const { InvoiceLineCard } = await import("@/src/components/invoices/InvoiceLineCard");

const line = (over: Partial<InvoiceLineView> = {}): InvoiceLineView => ({
  position: 4, description: "Zucchine romanesche", code: null, quantity: 2, unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 180, taxRatePct: 4, lineTotalCents: 360, matchLevel: "exact", action: "update_price", appliedPriceCents: 180,
  product: { id: "p1", name: "Zucchine", unidadCompra: "kg", precioCompra: 150, taxRatePct: 4 },
  siblings: [], quantityLooksMisread: false, ...over,
});

let card: ReactTestRenderer;
const texts = () => card.root.findAllByType("Text" as never).map((n) => n.children.join(""));
const node = (type: string) => card.root.findByType(type as never);
const button = (label: string) => card.root.findAllByType("Button" as never).find((n) => n.props.label === label);
async function render(l: InvoiceLineView, readOnly = false) {
  await act(async () => { card = create(createElement(InvoiceLineCard, { line: l, readOnly, onPatch: h.patch, onChooseProduct: h.choose })); });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});
afterEach(async () => { if (card) await act(async () => { card.unmount(); }); });

describe("InvoiceLineCard", () => {
  it("shows the paper text, the product and the price before → after", async () => {
    await render(line());
    expect(texts()).toEqual(expect.arrayContaining(["Zucchine romanesche", "Zucchine", "1,50 € → 1,80 € (+20 %)"]));
    expect(texts().join(" ")).toContain('invoice_line_tax:{"rate":4}');
  });

  it("a big change waits for a tick that updates the price", async () => {
    await render(line({ action: null }));
    await act(async () => { button('invoice_line_confirm_big_change:{"pct":20}')?.props.onPress(); });
    expect(h.patch).toHaveBeenCalledWith({ action: "update_price" });
  });

  it("a probable match is confirmed, or another product is chosen", async () => {
    await render(line({ action: null, matchLevel: "probable" }));
    await act(async () => { button("invoice_line_choose")?.props.onPress(); });
    expect(node("ConfirmMatchSheet").props.open).toBe(true);
    await act(async () => { node("ConfirmMatchSheet").props.onYes(); });
    expect(h.choose).toHaveBeenCalledWith("p1");
    await act(async () => { button("invoice_line_choose")?.props.onPress(); });
    await act(async () => { node("ConfirmMatchSheet").props.onNo(); });
    expect(node("ProductPickerSheet").props.open).toBe(true);
  });

  it("an ambiguous line picks a variant, or creates a product when none fits", async () => {
    const siblings = [{ productId: "p7", name: "Calamari 3P" }, { productId: "p8", name: "Calamari 5P" }];
    await render(line({ action: null, matchLevel: "ambiguo", product: null, siblings: siblings as never }));
    await act(async () => { button("invoice_line_choose")?.props.onPress(); });
    expect(node("PickVariantSheet").props.candidates).toEqual(siblings);
    await act(async () => { node("PickVariantSheet").props.onPick("p8"); });
    expect(h.choose).toHaveBeenCalledWith("p8");
    await act(async () => { node("PickVariantSheet").props.onNone(); });
    expect(h.patch).toHaveBeenCalledWith({ action: "create_draft" });
  });

  it("Change offers every decision, and choosing another product opens the picker", async () => {
    await render(line());
    await act(async () => { button("invoice_line_change")?.props.onPress(); });
    const sheet = node("ChoiceSheet");
    expect(sheet.props.options.map((o: { value: string }) => o.value)).toEqual(["update_price", "connect", "pick", "create_draft", "ignore"]);
    await act(async () => { sheet.props.onSelect("ignore"); });
    expect(h.patch).toHaveBeenCalledWith({ action: "ignore" });
    await act(async () => { button("invoice_line_change")?.props.onPress(); });
    await act(async () => { node("ChoiceSheet").props.onSelect("pick"); });
    await act(async () => { node("ProductPickerSheet").props.onPick("p3"); });
    expect(h.choose).toHaveBeenCalledWith("p3");
  });

  it("a new product line offers no price update for a product it does not have", async () => {
    await render(line({ action: "create_draft", product: null, matchLevel: "none" }));
    await act(async () => { button("invoice_line_change")?.props.onPress(); });
    expect(node("ChoiceSheet").props.options.map((o: { value: string }) => o.value)).toEqual(["pick", "create_draft", "ignore"]);
    expect(texts()).toContain("invoice_line_new_product");
  });

  it("editing the price keeps the line's decision", async () => {
    await render(line({ action: "create_draft", product: null }));
    await act(async () => { await node("EditableCell").props.onSave(2500); });
    expect(h.patch).toHaveBeenCalledWith({ action: "create_draft", priceCents: 2500 });
  });

  it("a misread quantity is flagged", async () => {
    await render(line({ quantityLooksMisread: true }));
    expect(card.root.findAllByType("StatusBadge" as never).map((n) => n.props.label)).toContain("invoice_warning_quantity");
  });

  it("an applied invoice only shows what was done", async () => {
    await render(line(), true);
    expect(card.root.findAllByType("Button" as never)).toHaveLength(0);
    expect(card.root.findAllByType("EditableCell" as never)).toHaveLength(0);
    expect(card.root.findAllByType("StatusBadge" as never).map((n) => n.props.label)).toContain("invoice_done_update_price");
  });
});
```

Create `apps/mobile/src/__tests__/product-picker-sheet.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({ list: vi.fn(), pick: vi.fn() }));
vi.mock("react-native", () => ({
  Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View", StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("@/src/api/products", () => ({ listProducts: h.list }));

import { ProductPickerSheet } from "@/src/components/invoices/ProductPickerSheet";

let sheet: ReactTestRenderer;
const type = async (text: string) => {
  await act(async () => { sheet.root.findByType("TextInput" as never).props.onChangeText(text); });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
};

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.list.mockResolvedValue([{ id: "p1", name: "Zucchine" }, { id: "p2", name: "Zucchine trombetta" }]);
  await act(async () => { sheet = create(createElement(ProductPickerSheet, { open: true, onPick: h.pick, onClose: vi.fn() })); });
});
afterEach(async () => {
  await act(async () => { sheet.unmount(); });
  vi.useRealTimers();
});

describe("ProductPickerSheet", () => {
  it("searches the bank after a short pause and picks a result", async () => {
    await type("zucc");
    expect(h.list).toHaveBeenCalledWith({ q: "zucc" });
    const row = sheet.root.findAllByType("Pressable" as never).find((n) => n.props.accessibilityLabel === "Zucchine trombetta");
    await act(async () => { row?.props.onPress(); });
    expect(h.pick).toHaveBeenCalledWith("p2");
  });

  it("does not search for a single letter, and says when nothing matches", async () => {
    await type("z");
    expect(h.list).not.toHaveBeenCalled();
    h.list.mockResolvedValue([]);
    await type("zz");
    expect(sheet.root.findAllByType("Text" as never).map((n) => n.children.join(""))).toContain("invoice_picker_empty");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter mobile exec vitest run src/__tests__/invoice-line-card.test.ts src/__tests__/product-picker-sheet.test.ts`
Expected: FAIL — `Failed to resolve import "@/src/components/invoices/InvoiceLineCard"` (and `ProductPickerSheet`).

- [ ] **Step 3: Write the product picker**

Create `apps/mobile/src/components/invoices/ProductPickerSheet.tsx`:

```tsx
// Search the bank and pick the product an invoice line goes to.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput } from "react-native";
import { listProducts, type Product } from "@/src/api/products";
import { BottomSheet } from "@/src/components/BottomSheet";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = { open: boolean; onPick: (productId: string) => void; onClose: () => void };

export function ProductPickerSheet({ open, onPick, onClose }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[] | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setResults(null);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      listProducts({ q })
        .then((items) => { if (live) setResults(items.slice(0, 20)); })
        .catch(() => { if (live) setResults([]); });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.title}>{t("invoice_line_choose")}</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t("invoice_picker_search")}
        placeholderTextColor={colors.mute}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {results && results.length === 0 ? <Text style={styles.empty}>{t("invoice_picker_empty")}</Text> : null}
      {results?.map((product) => (
        <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={product.name} style={styles.row} onPress={() => onPick(product.id)}>
          <Text style={styles.name}>{product.name}</Text>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifMd, color: colors.ink, marginBottom: spacing.md },
  input: {
    fontFamily: fonts.sans, fontSize: fontSizes.bodyLg, color: colors.ink, borderWidth: 1, borderColor: colors.edge,
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm,
  },
  empty: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.mute, paddingVertical: spacing.md },
  row: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.edgeSoft },
  name: { fontFamily: fonts.sans, fontSize: fontSizes.bodyLg, color: colors.ink },
});
```

- [ ] **Step 4: Write the line card**

Create `apps/mobile/src/components/invoices/InvoiceLineCard.tsx`:

```tsx
// One line of a supplier invoice: what the paper says, the product it goes to, the price
// before → after, and the chef's decision. A change of 20 % or more waits for a tick.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { InvoiceLineAction, InvoiceLinePatch, InvoiceLineView } from "@atelier/shared";
import { Button } from "@/src/components/Button";
import { ChoiceSheet } from "@/src/components/ChoiceSheet";
import { ConfirmMatchSheet } from "@/src/components/ConfirmMatchSheet";
import { EditableCell } from "@/src/components/EditableCell";
import { PickVariantSheet } from "@/src/components/PickVariantSheet";
import { StatusBadge } from "@/src/components/StatusBadge";
import { ProductPickerSheet } from "@/src/components/invoices/ProductPickerSheet";
import { useI18n } from "@/src/hooks/useI18n";
import { ACTION_KEY, DONE_KEY, lineState, priceChange } from "@/src/lib/invoice-view";
import { formatEuros, parseEurosToCents } from "@/src/lib/money";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Choice = InvoiceLineAction | "pick";
type Sheet = "none" | "change" | "probable" | "variant" | "picker";
type Props = {
  line: InvoiceLineView;
  readOnly: boolean;
  onPatch: (body: InvoiceLinePatch) => void;
  onChooseProduct: (productId: string) => void;
};

export function InvoiceLineCard({ line, readOnly, onPatch, onChooseProduct }: Props) {
  const { t } = useI18n();
  const [sheet, setSheet] = useState<Sheet>("none");
  const close = () => setSheet("none");
  const state = lineState(line);
  const change = priceChange(line);
  const product = line.action === "create_draft" ? null : line.product;

  const meta = [
    line.quantity !== null ? `${line.quantity} ${line.unit ?? ""}`.trim() : null,
    line.lineTotalCents !== null ? formatEuros(line.lineTotalCents) : null,
    line.taxRatePct !== null ? t("invoice_line_tax", { rate: line.taxRatePct }) : null,
  ].filter(Boolean).join(" · ");

  const choices: Array<{ value: Choice; label: string }> = [
    ...(line.product
      ? [{ value: "update_price" as const, label: t(ACTION_KEY.update_price) }, { value: "connect" as const, label: t(ACTION_KEY.connect) }]
      : []),
    { value: "pick", label: t("invoice_line_choose_other") },
    { value: "create_draft", label: t(ACTION_KEY.create_draft) },
    { value: "ignore", label: t(ACTION_KEY.ignore) },
  ];

  const chooseSheet: Sheet = state === "probable" ? "probable" : state === "ambiguous" ? "variant" : "picker";

  return (
    <View style={styles.card}>
      <Text style={styles.paper}>{line.description}</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      <Text style={styles.product}>{product ? product.name : t("invoice_line_new_product")}</Text>
      {change && line.action !== "create_draft" ? (
        <Text style={styles.price}>{`${formatEuros(change.beforeCents)} → ${formatEuros(change.afterCents)} (${change.pct > 0 ? "+" : ""}${change.pct} %)`}</Text>
      ) : null}
      {!readOnly && (line.action === "update_price" || line.action === "create_draft") ? (
        <EditableCell
          value={line.appliedPriceCents ?? 0}
          format={(v) => formatEuros(v)}
          parse={parseEurosToCents}
          onSave={async (v) => onPatch({ action: line.action!, priceCents: v })}
          width={104}
        />
      ) : null}
      {line.quantityLooksMisread ? <StatusBadge level="warning" label={t("invoice_warning_quantity")} /> : null}

      {readOnly ? (
        line.action ? <StatusBadge level="ok" label={t(DONE_KEY[line.action])} /> : null
      ) : (
        <View style={styles.actions}>
          {line.action ? <StatusBadge level="info" label={t(ACTION_KEY[line.action])} /> : null}
          {state === "tick" ? (
            <Button
              label={change ? t("invoice_line_confirm_big_change", { pct: Math.abs(change.pct) }) : t(ACTION_KEY.update_price)}
              onPress={() => onPatch({ action: "update_price" })}
            />
          ) : null}
          {state === "probable" || state === "ambiguous" || state === "choose" ? (
            <Button label={t("invoice_line_choose")} onPress={() => setSheet(chooseSheet)} />
          ) : null}
          <Button variant="ghost" label={t("invoice_line_change")} onPress={() => setSheet("change")} />
        </View>
      )}

      <ChoiceSheet<Choice>
        open={sheet === "change"}
        title={t("invoice_line_change")}
        options={choices}
        current={line.action ?? "pick"}
        onSelect={(value) => {
          if (value === "pick") {
            setSheet("picker");
            return;
          }
          close();
          onPatch({ action: value });
        }}
        onCancel={close}
      />
      {line.product ? (
        <ConfirmMatchSheet
          open={sheet === "probable"}
          rawText={line.description}
          candidateName={line.product.name}
          title={t("invoice_line_probable_title")}
          body={t("invoice_line_probable_body")}
          yesLabel={t("invoice_line_probable_yes")}
          noLabel={t("invoice_line_probable_no")}
          onYes={() => {
            close();
            onChooseProduct(line.product!.id);
          }}
          onNo={() => setSheet("picker")}
        />
      ) : null}
      <PickVariantSheet
        open={sheet === "variant"}
        rawText={line.description}
        candidates={line.siblings}
        title={t("invoice_line_variant_title")}
        body={t("invoice_line_variant_body")}
        noneLabel={t("invoice_line_variant_none")}
        onPick={(productId) => {
          close();
          onChooseProduct(productId);
        }}
        onNone={() => {
          close();
          onPatch({ action: "create_draft" });
        }}
      />
      <ProductPickerSheet
        open={sheet === "picker"}
        onPick={(productId) => {
          close();
          onChooseProduct(productId);
        }}
        onClose={close}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1,
    borderColor: colors.edgeSoft, backgroundColor: colors.paperSoft,
  },
  paper: { fontFamily: fonts.mono, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  meta: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  product: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifBody, color: colors.ink },
  price: { fontFamily: fonts.mono, fontSize: fontSizes.body, color: colors.ink },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
});
```

- [ ] **Step 5: Add the copy**

`packages/i18n/src/es.ts`:

```ts
  invoice_line_new_product: "Producto nuevo",
  invoice_line_tax: "IVA {rate} %",
  invoice_line_change: "Cambiar",
  invoice_line_confirm_big_change: "Confirmar cambio del {pct} %",
  invoice_line_choose: "Elegir producto",
  invoice_line_choose_other: "Elegir otro producto",
  invoice_line_probable_title: "¿Es este producto?",
  invoice_line_probable_body: "Si lo confirmas, la próxima factura de este proveedor lo reconocerá sola.",
  invoice_line_probable_yes: "Sí, es este",
  invoice_line_probable_no: "No, elegir otro",
  invoice_line_variant_title: "¿Cuál de estos?",
  invoice_line_variant_body: "Hay varios productos parecidos en el banco.",
  invoice_line_variant_none: "Ninguno: crear producto",
  invoice_warning_quantity: "Revisa la cantidad: podría estar mal leída.",
  invoice_picker_search: "Buscar en el banco",
  invoice_picker_empty: "Ningún producto con ese nombre.",
```

`packages/i18n/src/it.ts`:

```ts
  invoice_line_new_product: "Prodotto nuovo",
  invoice_line_tax: "IVA {rate} %",
  invoice_line_change: "Cambia",
  invoice_line_confirm_big_change: "Conferma la variazione del {pct} %",
  invoice_line_choose: "Scegli prodotto",
  invoice_line_choose_other: "Scegli un altro prodotto",
  invoice_line_probable_title: "È questo prodotto?",
  invoice_line_probable_body: "Se lo confermi, la prossima fattura di questo fornitore lo riconoscerà da sola.",
  invoice_line_probable_yes: "Sì, è questo",
  invoice_line_probable_no: "No, scegline un altro",
  invoice_line_variant_title: "Quale di questi?",
  invoice_line_variant_body: "Nel banco ci sono più prodotti simili.",
  invoice_line_variant_none: "Nessuno: crea prodotto",
  invoice_warning_quantity: "Controlla la quantità: potrebbe essere letta male.",
  invoice_picker_search: "Cerca nel banco",
  invoice_picker_empty: "Nessun prodotto con questo nome.",
```

`packages/i18n/src/en.ts`:

```ts
  invoice_line_new_product: "New product",
  invoice_line_tax: "VAT {rate} %",
  invoice_line_change: "Change",
  invoice_line_confirm_big_change: "Confirm the {pct} % change",
  invoice_line_choose: "Choose product",
  invoice_line_choose_other: "Choose another product",
  invoice_line_probable_title: "Is it this product?",
  invoice_line_probable_body: "If you confirm, this supplier's next invoice will recognise it on its own.",
  invoice_line_probable_yes: "Yes, that's it",
  invoice_line_probable_no: "No, choose another",
  invoice_line_variant_title: "Which of these?",
  invoice_line_variant_body: "The bank has several similar products.",
  invoice_line_variant_none: "None: create product",
  invoice_warning_quantity: "Check the quantity: it may be misread.",
  invoice_picker_search: "Search the bank",
  invoice_picker_empty: "No product with that name.",
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm --filter mobile exec vitest run src/__tests__/invoice-line-card.test.ts src/__tests__/product-picker-sheet.test.ts`
Expected: PASS.
Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/invoices/InvoiceLineCard.tsx apps/mobile/src/components/invoices/ProductPickerSheet.tsx apps/mobile/src/__tests__/invoice-line-card.test.ts apps/mobile/src/__tests__/product-picker-sheet.test.ts packages/i18n/src
git commit -m "feat(mobile): invoice line card with decisions and product picker"
```

---

### Task 13: Header sheet and the original

**Files:**
- Create: `apps/mobile/src/components/invoices/InvoiceHeaderSheet.tsx`
- Create: `apps/mobile/src/components/invoices/InvoiceOriginalSheet.tsx`
- Create: `apps/mobile/src/lib/invoice-original.ts`
- Modify: `packages/i18n/src/{es,it,en}.ts`
- Test: `apps/mobile/src/__tests__/invoice-header-sheet.test.ts`, `apps/mobile/src/lib/__tests__/invoice-original.test.ts`

**Interfaces:**
- Consumes: Task 5 `invoicePageSource`; Task 8 `buildHeaderPatch`, `formatDayInput`, `HeaderForm`; Task 2 `InvoiceHeaderPatch`.
- Produces: `InvoiceHeaderSheet({ open, invoice: Pick<InvoiceDetail, "supplier" | "number" | "issuedOn">, suppliers: ReadonlyArray<{ id: string; name: string }>, onSave: (patch: InvoiceHeaderPatch) => Promise<void>, onClose })`; `InvoiceOriginalSheet({ open, invoiceId: string, pages: number, onClose })`; `openInvoicePdf(invoiceId: string): Promise<void>`.
- Produces i18n keys: `invoice_header_title`, `invoice_header_supplier_new`, `invoice_header_supplier_placeholder`, `invoice_header_number_placeholder`, `invoice_header_date_placeholder`, `invoice_header_date_invalid`, `invoice_header_save`, `invoice_original_failed`, `invoice_supplier_label`, `invoice_number_label`, `invoice_date_label`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/lib/__tests__/invoice-original.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ download: vi.fn(), share: vi.fn(), source: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///cache/", downloadAsync: h.download }));
vi.mock("expo-sharing", () => ({ shareAsync: h.share }));
vi.mock("@/src/api/invoices", () => ({ invoicePageSource: h.source }));

import { openInvoicePdf } from "../invoice-original";

beforeEach(() => {
  vi.resetAllMocks();
  h.source.mockResolvedValue({ uri: "https://api/invoices/inv1/pages/0", headers: { Authorization: "Bearer tok" } });
  h.download.mockResolvedValue({ status: 200, uri: "file:///cache/invoice-inv1.pdf" });
});

describe("openInvoicePdf", () => {
  it("downloads the private PDF with the session token and opens it to share or view", async () => {
    await openInvoicePdf("inv1");
    expect(h.download).toHaveBeenCalledWith("https://api/invoices/inv1/pages/0", "file:///cache/invoice-inv1.pdf", { headers: { Authorization: "Bearer tok" } });
    expect(h.share).toHaveBeenCalledWith("file:///cache/invoice-inv1.pdf", { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  });

  it("a refused download is an error and opens nothing", async () => {
    h.download.mockResolvedValue({ status: 503, uri: "file:///cache/invoice-inv1.pdf" });
    await expect(openInvoicePdf("inv1")).rejects.toThrow("invoice_pdf_http_503");
    expect(h.share).not.toHaveBeenCalled();
  });
});
```

Create `apps/mobile/src/__tests__/invoice-header-sheet.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({ save: vi.fn(), close: vi.fn() }));
vi.mock("react-native", () => ({
  Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View", StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("@/src/components/Button", () => ({ Button: "Button" }));

import { InvoiceHeaderSheet } from "@/src/components/invoices/InvoiceHeaderSheet";

let sheet: ReactTestRenderer;
const input = (label: string) => sheet.root.findAllByType("TextInput" as never).find((n) => n.props.accessibilityLabel === label)!;
const chip = (label: string) => sheet.root.findAllByType("Pressable" as never).find((n) => n.props.accessibilityLabel === label)!;
const save = async () => {
  await act(async () => { await sheet.root.findAllByType("Button" as never).find((n) => n.props.label === "invoice_header_save")!.props.onPress(); });
};

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.save.mockResolvedValue(undefined);
  await act(async () => {
    sheet = create(createElement(InvoiceHeaderSheet, {
      open: true,
      invoice: { supplier: { id: "s1", name: "Recchioni" }, number: "77", issuedOn: "2026-10-10" },
      suppliers: [{ id: "s1", name: "Recchioni" }, { id: "s2", name: "Garden Fruit" }],
      onSave: h.save,
      onClose: h.close,
    }));
  });
});
afterEach(async () => { await act(async () => { sheet.unmount(); }); });

describe("InvoiceHeaderSheet", () => {
  it("starts from what was read and sends only what changed", async () => {
    expect(input("invoice_number_label").props.value).toBe("77");
    expect(input("invoice_date_label").props.value).toBe("10/10/2026");
    await act(async () => { chip("Garden Fruit").props.onPress(); input("invoice_number_label").props.onChangeText("78"); });
    await save();
    expect(h.save).toHaveBeenCalledWith({ supplierId: "s2", number: "78" });
    expect(h.close).toHaveBeenCalled();
  });

  it("a supplier not in the list is typed by name", async () => {
    await act(async () => { chip("invoice_header_supplier_new").props.onPress(); });
    await act(async () => { input("invoice_header_supplier_placeholder").props.onChangeText("Pescheria Adriatica"); });
    await save();
    expect(h.save).toHaveBeenCalledWith({ supplierName: "Pescheria Adriatica" });
  });

  it("a day that does not exist is shown as an error and nothing is sent", async () => {
    await act(async () => { input("invoice_date_label").props.onChangeText("31/02/2026"); });
    await save();
    expect(h.save).not.toHaveBeenCalled();
    expect(sheet.root.findAllByType("Text" as never).map((n) => n.children.join(""))).toContain("invoice_header_date_invalid");
  });

  it("a failed save keeps the sheet open", async () => {
    h.save.mockRejectedValue(new Error("offline"));
    await act(async () => { input("invoice_number_label").props.onChangeText("79"); });
    await save();
    expect(h.close).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/invoice-original.test.ts src/__tests__/invoice-header-sheet.test.ts`
Expected: FAIL — unresolved imports `../invoice-original` and `InvoiceHeaderSheet`.

- [ ] **Step 3: Implement the original viewers**

Create `apps/mobile/src/lib/invoice-original.ts`:

```ts
// A PDF original is private: it is downloaded with the session token into the app cache and
// handed to the system share sheet, which can view or save it. The cached copy is overwritten
// on the next open and cleared by the OS; deleting it right after sharing breaks Android viewers.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { invoicePageSource } from "@/src/api/invoices";

export async function openInvoicePdf(invoiceId: string): Promise<void> {
  const { uri, headers } = await invoicePageSource(invoiceId, 0);
  const download = await FileSystem.downloadAsync(uri, `${FileSystem.cacheDirectory}invoice-${invoiceId}.pdf`, { headers });
  if (download.status !== 200) throw new Error(`invoice_pdf_http_${download.status}`);
  await Sharing.shareAsync(download.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
}
```

Create `apps/mobile/src/components/invoices/InvoiceOriginalSheet.tsx`:

```tsx
// The scanned photo pages, loaded with the session token (the files are private).
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet } from "react-native";
import { invoicePageSource } from "@/src/api/invoices";
import { BottomSheet } from "@/src/components/BottomSheet";
import { colors, radii, spacing } from "@/src/theme";

type Source = { uri: string; headers: Record<string, string> };
type Props = { open: boolean; invoiceId: string; pages: number; onClose: () => void };

export function InvoiceOriginalSheet({ open, invoiceId, pages, onClose }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    Promise.all(Array.from({ length: pages }, (_, position) => invoicePageSource(invoiceId, position)))
      .then((loaded) => { if (live) setSources(loaded); })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, invoiceId, pages]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.pages}>
        {sources.map((source) => (
          <Image key={source.uri} source={source} style={styles.page} resizeMode="contain" />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pages: { gap: spacing.md, paddingBottom: spacing.xl },
  page: { width: "100%", aspectRatio: 0.7, borderRadius: radii.sm, backgroundColor: colors.paperWarm },
});
```

- [ ] **Step 4: Implement the header sheet**

Create `apps/mobile/src/components/invoices/InvoiceHeaderSheet.tsx`:

```tsx
// Correct what was read in the header: the supplier (one already known, or a typed name), the
// number and the day. Only what changed is sent.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { InvoiceDetail, InvoiceHeaderPatch } from "@atelier/shared";
import { BottomSheet } from "@/src/components/BottomSheet";
import { Button } from "@/src/components/Button";
import { useI18n } from "@/src/hooks/useI18n";
import { buildHeaderPatch, formatDayInput, type HeaderForm } from "@/src/lib/invoice-view";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  invoice: Pick<InvoiceDetail, "supplier" | "number" | "issuedOn">;
  suppliers: ReadonlyArray<{ id: string; name: string }>;
  onSave: (patch: InvoiceHeaderPatch) => Promise<void>;
  onClose: () => void;
};

const initialSupplier = (invoice: Props["invoice"]): HeaderForm["supplier"] =>
  invoice.supplier ? { kind: "existing", id: invoice.supplier.id } : { kind: "new", name: "" };

export function InvoiceHeaderSheet({ open, invoice, suppliers, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [supplier, setSupplier] = useState<HeaderForm["supplier"]>(initialSupplier(invoice));
  const [number, setNumber] = useState(invoice.number ?? "");
  const [day, setDay] = useState(invoice.issuedOn ? formatDayInput(invoice.issuedOn) : "");
  const [dateInvalid, setDateInvalid] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSupplier(initialSupplier(invoice));
    setNumber(invoice.number ?? "");
    setDay(invoice.issuedOn ? formatDayInput(invoice.issuedOn) : "");
    setDateInvalid(false);
  }, [open, invoice.supplier?.id, invoice.number, invoice.issuedOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const known = [...(invoice.supplier ? [invoice.supplier] : []), ...suppliers.filter((s) => s.id !== invoice.supplier?.id)];

  const save = async () => {
    const patch = buildHeaderPatch(invoice, { supplier, number, day });
    if (patch === "invalid_date") {
      setDateInvalid(true);
      return;
    }
    setDateInvalid(false);
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(patch);
      onClose();
    } catch {
      // The screen already said why; the sheet stays open with what the chef typed.
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.title}>{t("invoice_header_title")}</Text>
      <Text style={styles.label}>{t("invoice_supplier_label")}</Text>
      <View style={styles.chips}>
        {known.map((s) => {
          const selected = supplier.kind === "existing" && supplier.id === s.id;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={s.name}
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipOn]}
              onPress={() => setSupplier({ kind: "existing", id: s.id })}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{s.name}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("invoice_header_supplier_new")}
          accessibilityState={{ selected: supplier.kind === "new" }}
          style={[styles.chip, supplier.kind === "new" && styles.chipOn]}
          onPress={() => setSupplier({ kind: "new", name: "" })}
        >
          <Text style={[styles.chipText, supplier.kind === "new" && styles.chipTextOn]}>{t("invoice_header_supplier_new")}</Text>
        </Pressable>
      </View>
      {supplier.kind === "new" ? (
        <TextInput
          accessibilityLabel={t("invoice_header_supplier_placeholder")}
          value={supplier.name}
          onChangeText={(name) => setSupplier({ kind: "new", name })}
          placeholder={t("invoice_header_supplier_placeholder")}
          placeholderTextColor={colors.mute}
          style={styles.input}
        />
      ) : null}
      <Text style={styles.label}>{t("invoice_number_label")}</Text>
      <TextInput
        accessibilityLabel={t("invoice_number_label")}
        value={number}
        onChangeText={setNumber}
        placeholder={t("invoice_header_number_placeholder")}
        placeholderTextColor={colors.mute}
        autoCapitalize="characters"
        style={styles.input}
      />
      <Text style={styles.label}>{t("invoice_date_label")}</Text>
      <TextInput
        accessibilityLabel={t("invoice_date_label")}
        value={day}
        onChangeText={setDay}
        placeholder={t("invoice_header_date_placeholder")}
        placeholderTextColor={colors.mute}
        keyboardType="numbers-and-punctuation"
        style={styles.input}
      />
      {dateInvalid ? <Text style={styles.error}>{t("invoice_header_date_invalid")}</Text> : null}
      <Button label={t("invoice_header_save")} disabled={saving} onPress={save} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifMd, color: colors.ink, marginBottom: spacing.md },
  label: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute, marginTop: spacing.md, marginBottom: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.edge, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chipOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.ink },
  chipTextOn: { color: colors.paper },
  input: {
    fontFamily: fonts.sans, fontSize: fontSizes.bodyLg, color: colors.ink, borderWidth: 1, borderColor: colors.edge,
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  error: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.danger, marginTop: spacing.xs },
});
```

- [ ] **Step 5: Add the copy**

`packages/i18n/src/es.ts`:

```ts
  invoice_header_title: "Datos de la factura",
  invoice_header_supplier_new: "Otro proveedor…",
  invoice_header_supplier_placeholder: "Nombre del proveedor",
  invoice_header_number_placeholder: "Número de factura",
  invoice_header_date_placeholder: "DD/MM/AAAA",
  invoice_header_date_invalid: "Esa fecha no existe.",
  invoice_header_save: "Guardar",
  invoice_original_failed: "No se pudo abrir el original.",
  invoice_supplier_label: "Proveedor",
  invoice_number_label: "Número",
  invoice_date_label: "Fecha",
```

`packages/i18n/src/it.ts`:

```ts
  invoice_header_title: "Dati della fattura",
  invoice_header_supplier_new: "Altro fornitore…",
  invoice_header_supplier_placeholder: "Nome del fornitore",
  invoice_header_number_placeholder: "Numero della fattura",
  invoice_header_date_placeholder: "GG/MM/AAAA",
  invoice_header_date_invalid: "Questa data non esiste.",
  invoice_header_save: "Salva",
  invoice_original_failed: "Non è stato possibile aprire l'originale.",
  invoice_supplier_label: "Fornitore",
  invoice_number_label: "Numero",
  invoice_date_label: "Data",
```

`packages/i18n/src/en.ts`:

```ts
  invoice_header_title: "Invoice details",
  invoice_header_supplier_new: "Another supplier…",
  invoice_header_supplier_placeholder: "Supplier name",
  invoice_header_number_placeholder: "Invoice number",
  invoice_header_date_placeholder: "DD/MM/YYYY",
  invoice_header_date_invalid: "That date does not exist.",
  invoice_header_save: "Save",
  invoice_original_failed: "The original could not be opened.",
  invoice_supplier_label: "Supplier",
  invoice_number_label: "Number",
  invoice_date_label: "Date",
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/invoice-original.test.ts src/__tests__/invoice-header-sheet.test.ts`
Expected: PASS.
Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/invoices/InvoiceHeaderSheet.tsx apps/mobile/src/components/invoices/InvoiceOriginalSheet.tsx apps/mobile/src/lib/invoice-original.ts apps/mobile/src/lib/__tests__/invoice-original.test.ts apps/mobile/src/__tests__/invoice-header-sheet.test.ts packages/i18n/src
git commit -m "feat(mobile): correct an invoice header and view its original"
```

---

### Task 14: The invoice screen

**Files:**
- Create: `apps/mobile/app/facturas/[id].tsx`
- Modify: `packages/i18n/src/{es,it,en}.ts`
- Test: `apps/mobile/src/__tests__/invoice-screen.test.ts`

**Interfaces:**
- Consumes: Task 5 client (`getInvoice`, `retryInvoice`, `deleteInvoice`, `applyInvoice`, `patchInvoiceLine`, `chooseProduct`, `listInvoices`, `patchInvoiceHeader`, `InvoiceApplyResult`); Task 8 `STATUS_BADGE`, `failureKey`, `invoiceDay`, `formatDay`, `undecidedPositions`; Task 9 `usePolling`; Task 12 `InvoiceLineCard`; Task 13 `InvoiceHeaderSheet`, `InvoiceOriginalSheet`, `openInvoicePdf`; `invalidate` from `@/src/api/cache`.
- Produces: route `/facturas/[id]`.
- Produces i18n keys: `invoice_title`, `invoice_reading_title`, `invoice_reading_sub`, `invoice_failed_title`, `invoice_retry`, `invoice_delete`, `invoice_delete_confirm_title`, `invoice_delete_confirm_body`, `invoice_view_original`, `invoice_total_label`, `invoice_edit_header`, `invoice_warning_totals`, `invoice_warning_duplicate`, `invoice_warning_duplicate_open`, `invoice_apply`, `invoice_apply_undecided`, `invoice_apply_done`, `invoice_apply_already`, `invoice_skipped_product_deleted`, `invoice_skipped_newer_price`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/__tests__/invoice-screen.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { InvoiceDetail, InvoiceLineView } from "@atelier/shared";

const h = vi.hoisted(() => ({
  get: vi.fn(), retry: vi.fn(), remove: vi.fn(), apply: vi.fn(), patchLine: vi.fn(), choose: vi.fn(), list: vi.fn(), patchHeader: vi.fn(),
  invalidate: vi.fn(), toast: vi.fn(), push: vi.fn(), back: vi.fn(), pdf: vi.fn(), polling: null as boolean | null,
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useLocalSearchParams: () => ({ id: "inv1" }),
    useRouter: () => ({ push: h.push, back: h.back }),
    useFocusEffect: (fn: () => void) => useEffect(fn, [fn]),
  };
});
vi.mock("@/src/hooks/useI18n", () => ({
  useI18n: () => ({ lang: "es", t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
  dateLocale: () => "es-ES",
}));
vi.mock("@/src/hooks/usePolling", () => ({ usePolling: (active: boolean) => { h.polling = active; } }));
vi.mock("@/src/api/invoices", () => ({
  getInvoice: h.get, retryInvoice: h.retry, deleteInvoice: h.remove, applyInvoice: h.apply, patchInvoiceLine: h.patchLine,
  chooseProduct: h.choose, listInvoices: h.list, patchInvoiceHeader: h.patchHeader,
}));
vi.mock("@/src/api/cache", () => ({ invalidate: h.invalidate }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "error_message" }));
vi.mock("@/src/lib/invoice-original", () => ({ openInvoicePdf: h.pdf }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));
for (const name of ["Screen", "Button", "ConfirmSheet", "NetworkError", "StatusBadge"]) {
  vi.doMock(`@/src/components/${name}`, () => ({ [name]: name }));
}
for (const name of ["InvoiceLineCard", "InvoiceHeaderSheet", "InvoiceOriginalSheet"]) {
  vi.doMock(`@/src/components/invoices/${name}`, () => ({ [name]: name }));
}

const { default: InvoiceScreen } = await import("../../app/facturas/[id]");

const line = (over: Partial<InvoiceLineView> = {}): InvoiceLineView => ({
  position: 0, description: "Zucchine", code: null, quantity: 2, unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 180, taxRatePct: 4, lineTotalCents: 360, matchLevel: "exact", action: "update_price", appliedPriceCents: 180,
  product: { id: "p1", name: "Zucchine", unidadCompra: "kg", precioCompra: 150, taxRatePct: 4 }, siblings: [], quantityLooksMisread: false, ...over,
});
const invoice = (over: Partial<InvoiceDetail> = {}): InvoiceDetail => ({
  id: "inv1", status: "review", number: "77", issuedOn: "2026-10-10", grossTotalCents: 2288, netTotalCents: 2200, failureReason: null,
  createdAt: "2026-10-11T08:00:00.000Z", supplier: { id: "s1", name: "Recchioni" }, taxTotalCents: 88,
  pages: [{ position: 0, mimeType: "image/jpeg" }], lines: [line()],
  checks: { totals: { status: "ok", sumCents: 2200, diffCents: 0 }, duplicateOf: null }, ...over,
});

let screen: ReactTestRenderer;
const texts = () => screen.root.findAllByType("Text" as never).map((n) => n.children.join(""));
const button = (label: string) => screen.root.findAllByType("Button" as never).find((n) => n.props.label === label);
const press = async (label: string) => { await act(async () => { await button(label)?.props.onPress(); }); };
async function render() { await act(async () => { screen = create(createElement(InvoiceScreen)); }); }

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.polling = null;
  h.get.mockResolvedValue(invoice());
  h.apply.mockResolvedValue({ updated: 1, drafts: 0, connected: 0, ignored: 0, skipped: [] });
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("invoice screen", () => {
  it("while reading it says so and refreshes by itself", async () => {
    h.get.mockResolvedValue(invoice({ status: "reading", lines: [] }));
    await render();
    expect(texts()).toContain("invoice_reading_title");
    expect(h.polling).toBe(true);
  });

  it("a failed read gives its plain reason and can be retried", async () => {
    h.get.mockResolvedValue(invoice({ status: "failed", failureReason: "unreadable", lines: [] }));
    await render();
    expect(texts()).toContain("invoice_failure_unreadable");
    expect(h.polling).toBe(false);
    await press("invoice_retry");
    expect(h.retry).toHaveBeenCalledWith("inv1");
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("deleting asks first, then goes back", async () => {
    await render();
    await press("invoice_delete");
    const confirm = screen.root.findByType("ConfirmSheet" as never);
    expect(confirm.props.open).toBe(true);
    await act(async () => { await confirm.props.onConfirm(); });
    expect(h.remove).toHaveBeenCalledWith("inv1");
    expect(h.back).toHaveBeenCalled();
  });

  it("Apply waits until every line is decided and says how many are left", async () => {
    h.get.mockResolvedValue(invoice({ lines: [line(), line({ position: 1, action: null }), line({ position: 2, action: null })] }));
    await render();
    const apply = button('invoice_apply_undecided:{"count":2}');
    expect(apply?.props.disabled).toBe(true);
  });

  it("applying refreshes products and recipes and shows what was done", async () => {
    h.apply.mockResolvedValue({ updated: 1, drafts: 1, connected: 0, ignored: 0, skipped: [{ position: 0, reason: "newer_price" }] });
    await render();
    h.get.mockResolvedValue(invoice({ status: "applied" }));
    await press("invoice_apply");
    expect(h.apply).toHaveBeenCalledWith("inv1");
    expect(h.invalidate).toHaveBeenCalledWith("products:");
    expect(h.invalidate).toHaveBeenCalledWith("recipes:");
    expect(texts()).toEqual(expect.arrayContaining(['invoice_apply_done:{"updated":1,"drafts":1}', 'invoice_skipped_newer_price:{"line":"Zucchine"}']));
  });

  it("a second press while applying sends nothing", async () => {
    let finish: (v: unknown) => void = () => undefined;
    h.apply.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render();
    const apply = button("invoice_apply")!;
    await act(async () => { void apply.props.onPress(); void apply.props.onPress(); });
    await act(async () => { finish({ updated: 1, drafts: 0, connected: 0, ignored: 0, skipped: [] }); });
    expect(h.apply).toHaveBeenCalledTimes(1);
  });

  it("an invoice applied from another phone says so", async () => {
    h.apply.mockResolvedValue({ alreadyApplied: true });
    await render();
    await press("invoice_apply");
    expect(texts()).toContain("invoice_apply_already");
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("an applied invoice is read only", async () => {
    h.get.mockResolvedValue(invoice({ status: "applied" }));
    await render();
    expect(screen.root.findByType("InvoiceLineCard" as never).props.readOnly).toBe(true);
    expect(button("invoice_apply")).toBeUndefined();
    expect(button("invoice_edit_header")).toBeUndefined();
  });

  it("warns about totals that do not add up and about a duplicate, which opens", async () => {
    h.get.mockResolvedValue(invoice({ checks: { totals: { status: "mismatch", sumCents: 2000, diffCents: 200 }, duplicateOf: "inv0" } }));
    await render();
    expect(texts()).toEqual(expect.arrayContaining(['invoice_warning_totals:{"sum":"20,00 €"}', "invoice_warning_duplicate"]));
    await press("invoice_warning_duplicate_open");
    expect(h.push).toHaveBeenCalledWith("/facturas/inv0");
  });

  it("a line decision is saved and the invoice reloaded; a refusal is explained", async () => {
    await render();
    const card = screen.root.findByType("InvoiceLineCard" as never);
    await act(async () => { await card.props.onChooseProduct("p9"); });
    expect(h.choose).toHaveBeenCalledWith("inv1", 0, "p9");
    expect(h.get).toHaveBeenCalledTimes(2);
    h.patchLine.mockRejectedValueOnce(new Error("409"));
    await act(async () => { await screen.root.findByType("InvoiceLineCard" as never).props.onPatch({ action: "ignore" }); });
    expect(h.toast).toHaveBeenCalledWith("error_message", "error");
  });

  it("a PDF original opens through the share sheet; photos open in the viewer", async () => {
    h.get.mockResolvedValue(invoice({ pages: [{ position: 0, mimeType: "application/pdf" }] }));
    await render();
    await press("invoice_view_original");
    expect(h.pdf).toHaveBeenCalledWith("inv1");
    await act(async () => { screen.unmount(); });
    h.get.mockResolvedValue(invoice());
    await render();
    await press("invoice_view_original");
    expect(screen.root.findByType("InvoiceOriginalSheet" as never).props).toMatchObject({ open: true, pages: 1 });
  });

  it("the header can be corrected with the known suppliers", async () => {
    h.list.mockResolvedValue({ toReview: 1, suppliers: [{ supplier: { id: "s2", name: "Garden Fruit" }, invoices: [] }, { supplier: null, invoices: [] }] });
    await render();
    await press("invoice_edit_header");
    const sheet = screen.root.findByType("InvoiceHeaderSheet" as never);
    expect(sheet.props.open).toBe(true);
    expect(sheet.props.suppliers).toEqual([{ id: "s2", name: "Garden Fruit" }]);
    await act(async () => { await sheet.props.onSave({ number: "78" }); });
    expect(h.patchHeader).toHaveBeenCalledWith("inv1", { number: "78" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter mobile exec vitest run src/__tests__/invoice-screen.test.ts`
Expected: FAIL — `Failed to resolve import "../../app/facturas/[id]"`.

- [ ] **Step 3: Write the screen**

Create `apps/mobile/app/facturas/[id].tsx`:

```tsx
// One supplier invoice: reading (refreshes by itself), failed (a plain reason, retry or delete),
// review (decide every line, then apply) or applied (read-only, what was done per line).
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { InvoiceDetail, InvoiceHeaderPatch, InvoiceLinePatch } from "@atelier/shared";
import { invalidate } from "@/src/api/cache";
import {
  applyInvoice, chooseProduct, deleteInvoice, getInvoice, listInvoices, patchInvoiceHeader, patchInvoiceLine, retryInvoice,
  type InvoiceApplyResult,
} from "@/src/api/invoices";
import { Button } from "@/src/components/Button";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { NetworkError } from "@/src/components/NetworkError";
import { Screen } from "@/src/components/Screen";
import { StatusBadge } from "@/src/components/StatusBadge";
import { showToast } from "@/src/components/Toast";
import { InvoiceHeaderSheet } from "@/src/components/invoices/InvoiceHeaderSheet";
import { InvoiceLineCard } from "@/src/components/invoices/InvoiceLineCard";
import { InvoiceOriginalSheet } from "@/src/components/invoices/InvoiceOriginalSheet";
import { usePolling } from "@/src/hooks/usePolling";
import { dateLocale, useI18n } from "@/src/hooks/useI18n";
import { apiErrorMessage } from "@/src/lib/api-error";
import { openInvoicePdf } from "@/src/lib/invoice-original";
import { failureKey, formatDay, invoiceDay, STATUS_BADGE, undecidedPositions } from "@/src/lib/invoice-view";
import { formatEuros } from "@/src/lib/money";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Sheet = "none" | "delete" | "header" | "original";

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, lang } = useI18n();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet>("none");
  const [summary, setSummary] = useState<InvoiceApplyResult | null>(null);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const applying = useRef(false);

  const reload = useCallback(async () => {
    try {
      setInvoice(await getInvoice(id));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  usePolling(invoice?.status === "reading" || invoice?.status === "uploading", () => { void reload(); });

  const explain = (error: unknown) => showToast(apiErrorMessage(error, t), "error");
  const decide = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      explain(error);
    }
    await reload();
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteInvoice(id);
      setSheet("none");
      router.back();
    } catch (error) {
      explain(error);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (applying.current) return;
    applying.current = true;
    setBusy(true);
    try {
      const result = await applyInvoice(id);
      invalidate("products:");
      invalidate("recipes:");
      setSummary(result);
    } catch (error) {
      explain(error);
    } finally {
      applying.current = false;
      setBusy(false);
    }
    await reload();
  };

  const openHeader = async () => {
    setSheet("header");
    try {
      const list = await listInvoices();
      setSuppliers(list.suppliers.flatMap((group) => (group.supplier ? [group.supplier] : [])));
    } catch {
      setSuppliers([]);
    }
  };
  const saveHeader = async (patch: InvoiceHeaderPatch) => {
    try {
      await patchInvoiceHeader(id, patch);
    } catch (error) {
      explain(error);
      throw error;
    }
    await reload();
  };

  const openOriginal = async () => {
    if (invoice?.pages[0]?.mimeType !== "application/pdf") {
      setSheet("original");
      return;
    }
    try {
      await openInvoicePdf(id);
    } catch {
      showToast(t("invoice_original_failed"), "error");
    }
  };

  const shell = (children: React.ReactNode) => (
    <Screen title={t("invoice_title")} back onBack={() => router.back()}>
      {children}
    </Screen>
  );

  if (!invoice) {
    return shell(loadFailed ? <NetworkError onRetry={() => void reload()} /> : <ActivityIndicator color={colors.teal} style={styles.loading} />);
  }

  if (invoice.status === "reading" || invoice.status === "uploading") {
    return shell(
      <View style={styles.centered}>
        <ActivityIndicator color={colors.teal} />
        <Text style={styles.stateTitle}>{t("invoice_reading_title")}</Text>
        <Text style={styles.stateSub}>{t("invoice_reading_sub")}</Text>
      </View>,
    );
  }

  const deleteSheet = (
    <ConfirmSheet
      open={sheet === "delete"}
      title={t("invoice_delete_confirm_title")}
      body={t("invoice_delete_confirm_body")}
      confirmLabel={t("invoice_delete")}
      cancelLabel={t("confirm_cancel")}
      destructive
      busy={busy}
      onConfirm={remove}
      onCancel={() => setSheet("none")}
    />
  );

  if (invoice.status === "failed") {
    return shell(
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>{t("invoice_failed_title")}</Text>
        <Text style={styles.stateSub}>{t(failureKey(invoice.failureReason))}</Text>
        <Button label={t("invoice_retry")} onPress={() => decide(() => retryInvoice(id))} />
        <Button label={t("invoice_delete")} variant="danger" onPress={() => setSheet("delete")} />
        {deleteSheet}
      </View>,
    );
  }

  const inReview = invoice.status === "review";
  const undecided = undecidedPositions(invoice.lines).length;
  const total = invoice.grossTotalCents ?? invoice.netTotalCents;
  const badge = STATUS_BADGE[invoice.status];
  const describeLine = (position: number) => invoice.lines.find((l) => l.position === position)?.description ?? `#${position + 1}`;

  return shell(
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.supplier}>{invoice.supplier?.name ?? t("invoices_no_supplier")}</Text>
            <StatusBadge level={badge.level} label={t(badge.key)} />
          </View>
          <Text style={styles.headerLine}>{`${t("invoice_number_label")}: ${invoice.number ?? t("invoices_no_number")}`}</Text>
          <Text style={styles.headerLine}>{`${t("invoice_date_label")}: ${formatDay(invoiceDay(invoice), dateLocale(lang))}`}</Text>
          {total !== null ? <Text style={styles.headerLine}>{`${t("invoice_total_label")}: ${formatEuros(total)}`}</Text> : null}
          <View style={styles.headerActions}>
            {inReview ? <Button label={t("invoice_edit_header")} variant="ghost" onPress={openHeader} /> : null}
            <Button label={t("invoice_view_original")} variant="ghost" onPress={openOriginal} />
            {inReview ? <Button label={t("invoice_delete")} variant="ghost" onPress={() => setSheet("delete")} /> : null}
          </View>
        </View>

        {invoice.checks.totals.status === "mismatch" && invoice.checks.totals.sumCents !== null ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>{t("invoice_warning_totals", { sum: formatEuros(invoice.checks.totals.sumCents) })}</Text>
          </View>
        ) : null}
        {invoice.checks.duplicateOf ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>{t("invoice_warning_duplicate")}</Text>
            <Button
              label={t("invoice_warning_duplicate_open")}
              variant="ghost"
              onPress={() => router.push(`/facturas/${invoice.checks.duplicateOf}` as never)}
            />
          </View>
        ) : null}

        {summary ? (
          <View style={styles.summary}>
            {"updated" in summary ? (
              <>
                <Text style={styles.summaryText}>{t("invoice_apply_done", { updated: summary.updated, drafts: summary.drafts })}</Text>
                {summary.skipped.map((s) => (
                  <Text key={s.position} style={styles.summarySkipped}>
                    {t(s.reason === "product_deleted" ? "invoice_skipped_product_deleted" : "invoice_skipped_newer_price", { line: describeLine(s.position) })}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={styles.summaryText}>{t("invoice_apply_already")}</Text>
            )}
          </View>
        ) : null}

        {invoice.lines.map((line) => (
          <InvoiceLineCard
            key={line.position}
            line={line}
            readOnly={!inReview}
            onPatch={(body: InvoiceLinePatch) => decide(() => patchInvoiceLine(id, line.position, body))}
            onChooseProduct={(productId: string) => decide(() => chooseProduct(id, line.position, productId))}
          />
        ))}
      </ScrollView>

      {inReview ? (
        <View style={styles.footer}>
          <Button
            label={undecided > 0 ? t("invoice_apply_undecided", { count: undecided }) : t("invoice_apply")}
            disabled={undecided > 0 || busy}
            onPress={apply}
          />
        </View>
      ) : null}

      {deleteSheet}
      <InvoiceHeaderSheet open={sheet === "header"} invoice={invoice} suppliers={suppliers} onSave={saveHeader} onClose={() => setSheet("none")} />
      <InvoiceOriginalSheet open={sheet === "original"} invoiceId={id} pages={invoice.pages.length} onClose={() => setSheet("none")} />
    </>,
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xxl },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl },
  stateTitle: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifMd, color: colors.ink, textAlign: "center" },
  stateSub: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft, textAlign: "center" },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 3 },
  header: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.paperWarm },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  supplier: { flex: 1, fontFamily: fonts.serifMedium, fontSize: fontSizes.serifLg, color: colors.ink },
  headerLine: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  warning: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.terracotaSoft },
  warningText: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  summary: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.tealSoft },
  summaryText: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  summarySkipped: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.edgeSoft, backgroundColor: colors.paper },
});
```

- [ ] **Step 4: Add the copy**

`packages/i18n/src/es.ts`:

```ts
  invoice_title: "Factura",
  invoice_reading_title: "Leyendo la factura…",
  invoice_reading_sub: "Tarda hasta un minuto. Puedes salir: te esperará en la lista.",
  invoice_failed_title: "No se pudo leer",
  invoice_retry: "Reintentar",
  invoice_delete: "Eliminar factura",
  invoice_delete_confirm_title: "¿Eliminar esta factura?",
  invoice_delete_confirm_body: "Va a la papelera y se borra del todo en 7 días. Los precios ya aplicados no cambian.",
  invoice_view_original: "Ver original",
  invoice_total_label: "Total",
  invoice_edit_header: "Editar datos",
  invoice_warning_totals: "Las líneas suman {sum} y el total impreso es otro: revisa si falta alguna.",
  invoice_warning_duplicate: "Ya escaneaste una factura con este número de este proveedor.",
  invoice_warning_duplicate_open: "Ver la otra",
  invoice_apply: "Aplicar",
  invoice_apply_undecided: "Faltan {count} líneas por decidir",
  invoice_apply_done: "Listo: {updated} precios actualizados y {drafts} productos creados.",
  invoice_apply_already: "Esta factura ya estaba aplicada.",
  invoice_skipped_product_deleted: "{line}: no se aplicó, el producto se había borrado.",
  invoice_skipped_newer_price: "{line}: no se aplicó, ya tenía un precio más reciente.",
```

`packages/i18n/src/it.ts`:

```ts
  invoice_title: "Fattura",
  invoice_reading_title: "Sto leggendo la fattura…",
  invoice_reading_sub: "Ci vuole fino a un minuto. Puoi uscire: la ritrovi nella lista.",
  invoice_failed_title: "Non è stato possibile leggerla",
  invoice_retry: "Riprova",
  invoice_delete: "Elimina fattura",
  invoice_delete_confirm_title: "Eliminare questa fattura?",
  invoice_delete_confirm_body: "Va nel cestino e viene cancellata del tutto tra 7 giorni. I prezzi già applicati non cambiano.",
  invoice_view_original: "Vedi originale",
  invoice_total_label: "Totale",
  invoice_edit_header: "Modifica dati",
  invoice_warning_totals: "Le righe sommano {sum} ma il totale stampato è diverso: controlla se ne manca qualcuna.",
  invoice_warning_duplicate: "Hai già scansionato una fattura con questo numero di questo fornitore.",
  invoice_warning_duplicate_open: "Vedi l'altra",
  invoice_apply: "Applica",
  invoice_apply_undecided: "Mancano {count} righe da decidere",
  invoice_apply_done: "Fatto: {updated} prezzi aggiornati e {drafts} prodotti creati.",
  invoice_apply_already: "Questa fattura era già applicata.",
  invoice_skipped_product_deleted: "{line}: non applicata, il prodotto era stato eliminato.",
  invoice_skipped_newer_price: "{line}: non applicata, aveva già un prezzo più recente.",
```

`packages/i18n/src/en.ts`:

```ts
  invoice_title: "Invoice",
  invoice_reading_title: "Reading the invoice…",
  invoice_reading_sub: "It takes up to a minute. You can leave: it will wait in the list.",
  invoice_failed_title: "It could not be read",
  invoice_retry: "Try again",
  invoice_delete: "Delete invoice",
  invoice_delete_confirm_title: "Delete this invoice?",
  invoice_delete_confirm_body: "It goes to the trash and is fully deleted in 7 days. Prices already applied do not change.",
  invoice_view_original: "View original",
  invoice_total_label: "Total",
  invoice_edit_header: "Edit details",
  invoice_warning_totals: "The lines add up to {sum} but the printed total differs: check whether one is missing.",
  invoice_warning_duplicate: "You already scanned an invoice with this number from this supplier.",
  invoice_warning_duplicate_open: "View the other",
  invoice_apply: "Apply",
  invoice_apply_undecided: "{count} lines still to decide",
  invoice_apply_done: "Done: {updated} prices updated and {drafts} products created.",
  invoice_apply_already: "This invoice was already applied.",
  invoice_skipped_product_deleted: "{line}: not applied, the product had been deleted.",
  invoice_skipped_newer_price: "{line}: not applied, it already had a newer price.",
```

- [ ] **Step 5: Run the test and typecheck**

Run: `pnpm --filter mobile exec vitest run src/__tests__/invoice-screen.test.ts`
Expected: PASS (12 tests).
Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/facturas/[id].tsx" apps/mobile/src/__tests__/invoice-screen.test.ts packages/i18n/src
git commit -m "feat(mobile): review, apply and follow a supplier invoice"
```

---

### Task 15: Product detail — tax rate and invoice links

**Files:**
- Create: `apps/mobile/src/lib/product-cost.ts`
- Modify: `apps/mobile/app/productos/[id].tsx` (`realCostLocal` at :83, `handleSavePrice` :211-230, `handleSaveMerma` :236-254, merma row :523-531, history rows :687-695)
- Modify: `apps/mobile/src/api/products.ts:43-49` (`PriceHistoryEntry`)
- Modify: `packages/i18n/src/{es,it,en}.ts`
- Test: `apps/mobile/src/lib/__tests__/product-cost.test.ts`

**Interfaces:**
- Consumes: Task 1 `ProductDetail.taxRatePct`, `PatchProductRequest.taxRatePct`; history API `invoiceId` (Plan 2, Task 16).
- Produces: `realCostWithTax(cents: number, mermaPct: number, taxRatePct?: number): number | null`, `parseTaxRatePct(input: string): number | null`; `PriceHistoryEntry.invoiceId?: string | null`; i18n key `producto_tax_label`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/__tests__/product-cost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseTaxRatePct, realCostWithTax } from "../product-cost";

describe("realCostWithTax", () => {
  it("adds the purchase tax and spreads the waste, like the server", () => {
    expect(realCostWithTax(500, 20, 10)).toBeCloseTo((500 * 1.1) / 0.8, 6);
    expect(realCostWithTax(500, 0)).toBe(500);
  });
  it("has no real cost when nothing is usable", () => expect(realCostWithTax(500, 100, 4)).toBeNull());
});

describe("parseTaxRatePct", () => {
  it.each([["10", 10], ["10,5", 10.5], ["4 %", 4], ["0", 0], ["22.00", 22]])("reads %j as %s", (input, value) =>
    expect(parseTaxRatePct(input)).toBe(value));
  it.each([[""], ["abc"], ["101"], ["-4"], ["10,555"]])("refuses %j", (input) => expect(parseTaxRatePct(input)).toBeNull());
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/product-cost.test.ts`
Expected: FAIL — `Failed to resolve import "../product-cost"`.

- [ ] **Step 3: Implement the helpers**

Create `apps/mobile/src/lib/product-cost.ts`:

```ts
// The bank's real cost, computed the way the server does it (projections.ts): the price plus
// its purchase tax, over the useful yield. Used for the optimistic update while a save travels.
export function realCostWithTax(cents: number, mermaPct: number, taxRatePct = 0): number | null {
  if (!Number.isFinite(mermaPct) || mermaPct < 0 || mermaPct >= 100) return null;
  return (cents * (1 + taxRatePct / 100)) / (1 - mermaPct / 100);
}

// "10", "10,5", "4 %" → 10, 10.5, 4. Outside 0–100 or with more than 2 decimals → null.
export function parseTaxRatePct(input: string): number | null {
  const cleaned = input.replace("%", "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value <= 100 ? value : null;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/product-cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the product detail screen**

`apps/mobile/src/api/products.ts`, in `PriceHistoryEntry` after `author`:

```ts
  // The invoice line this price came from, when it came from an invoice.
  invoiceId?: string | null;
```

`apps/mobile/app/productos/[id].tsx`:
- delete `function realCostLocal` (:83-86) and add `import { parseTaxRatePct, realCostWithTax } from "@/src/lib/product-cost";`;
- in `handleSavePrice` replace `realCostLocal(cents, product.mermaPct)` with `realCostWithTax(cents, product.mermaPct, product.taxRatePct ?? 0)`;
- in `handleSaveMerma` replace `realCostLocal(product.precioCompra, pct)` with `realCostWithTax(product.precioCompra, pct, product.taxRatePct ?? 0)`;
- after `handleSaveMerma`, add:

```tsx
  // Save of the purchase tax: it is part of the real cost, like in recipe cost.
  const handleSaveTax = useCallback(
    async (pct: number) => {
      if (!product) return;
      const before = product;
      setProduct({ ...product, taxRatePct: pct, realCost: realCostWithTax(product.precioCompra, product.mermaPct, pct) });
      try {
        setProduct(await patchProduct(product.id, { taxRatePct: pct }));
      } catch (err) {
        setProduct(before);
        throw err;
      }
    },
    [product],
  );
```

- after the merma `fieldRow` (the `View` holding `producto_form_merma_label`), add:

```tsx
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>{t("producto_tax_label")}</Text>
          <EditableCell
            value={product.taxRatePct ?? 0}
            format={(v) => `${v.toLocaleString(dateLocale(lang))} %`}
            parse={parseTaxRatePct}
            onSave={handleSaveTax}
            readOnly={!canEditFields}
            width={64}
          />
        </View>
```

- replace the history row map (:687-695) with:

```tsx
                  history.priceHistory.map((row) => {
                    const cells = (
                      <>
                        <Text style={styles.historyDate}>
                          {new Date(row.createdAt).toLocaleDateString(dateLocale(lang))}
                        </Text>
                        <Text style={styles.historyValue}>
                          {formatEurosPerUnit(row.precio, UNIT_SHORT[row.unidadCompra])}
                        </Text>
                      </>
                    );
                    // A price that came from an invoice opens it (only for who can see invoices).
                    return row.invoiceId && canEditFields ? (
                      <Pressable
                        key={row.id}
                        style={styles.historyRow}
                        accessibilityRole="link"
                        onPress={() => router.push(`/facturas/${row.invoiceId}` as never)}
                      >
                        {cells}
                        <Ionicons name="receipt-outline" size={14} color={colors.mute} />
                      </Pressable>
                    ) : (
                      <View key={row.id} style={styles.historyRow}>
                        {cells}
                      </View>
                    );
                  })
```

(`Pressable` and `Ionicons` are already imported in this file; if `Pressable` is not, add it to the named `react-native` import.)

`packages/i18n/src/es.ts`: `producto_tax_label: "IVA",` — `it.ts`: `producto_tax_label: "IVA",` — `en.ts`: `producto_tax_label: "VAT",`.

- [ ] **Step 6: Run the suite and typecheck**

Run: `pnpm --filter mobile exec vitest run`
Expected: PASS (all mobile tests).
Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/product-cost.ts apps/mobile/src/lib/__tests__/product-cost.test.ts "apps/mobile/app/productos/[id].tsx" apps/mobile/src/api/products.ts packages/i18n/src
git commit -m "feat(mobile): purchase tax on the product and price history linked to invoices"
```

---

### Task 16: Gate

**Files:**
- Modify: `odd/tasks/supplier-invoice-scanner.md` (`## Log`)

- [ ] **Step 1: Full suites and typecheck**

Run: `pnpm --filter api exec vitest run > "$TMP/plan3-api.txt" 2>&1; tail -n 6 "$TMP/plan3-api.txt"`
Expected: `Test Files  N passed (N)` with no failures.
Run: `pnpm --filter mobile exec vitest run > "$TMP/plan3-mobile.txt" 2>&1; tail -n 6 "$TMP/plan3-mobile.txt"`
Expected: no failures.
Run: `pnpm typecheck`
Expected: no errors.
Run: `graphify update .`
Expected: the graph updates (AST only).

- [ ] **Step 2: Device checklist (needs a new native build: `expo-image-manipulator` and the new permission texts)**

On an Android phone and an iPhone with the new build, against the dev API (`INVOICE_BLOB_READ_WRITE_TOKEN` → `atelier-invoices`):
1. Casa shows "Facturas" under Banco for a sous chef; a viewer does not see it.
2. Scan a 2-page paper invoice with the camera: both pages show, "Listo" opens the invoice in "Leyendo…", and it moves to review by itself within about a minute.
3. Choose an iPhone gallery photo (HEIC): it is accepted.
4. Choose a PDF under 4 MB and one over 4 MB: the first becomes its own invoice, the second is refused with the size message.
5. In review: confirm a big change with its tick, pick a variant, choose another product, ignore a line and take it back, edit a price, correct the supplier and date, open the original (photo viewer; PDF via share sheet).
6. Apply: the summary appears, the bank shows the new prices (with tax in the real cost), a recipe using the product shows the new cost, and the product's price history row opens the invoice.
7. Put the phone in airplane mode halfway through sending 3 pages: the pages stay on the scanner and no invoice is left "Subiendo" in the list.
8. Lock the phone while an invoice is reading and unlock it: the screen refreshes on return.

- [ ] **Step 3: Log and commit**

Append to `## Log` in `odd/tasks/supplier-invoice-scanner.md` an entry with the date, the commit range of Plan 3, suite counts, typecheck result, the device checklist outcome (or "pending: needs native build"), and the rulings above. Then:

```bash
git add odd/tasks/supplier-invoice-scanner.md
git commit -m "docs(odd): record plan 3 gate"
```

- [ ] **Step 4: Final whole-branch review**

Follow the execution skill's final review over the Plan 3 commits, with this plan's Review Focus and Rulings as input.
