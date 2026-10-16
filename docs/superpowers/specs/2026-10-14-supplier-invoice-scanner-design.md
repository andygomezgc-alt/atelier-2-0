# Supplier invoice scanner — design

Date: 2026-10-14 · Status: approved in conversation, pending written-spec review · Branch: `feat/supplier-invoice-scanner`

## Goal

Chefs photograph (or pick a PDF of) the paper invoices and delivery notes they receive from suppliers. AI reads them, each line is connected to a product in the product bank, the chef reviews, and prices are updated. Recipe costs follow automatically. Every invoice is archived with its original photo or PDF, grouped by supplier and ordered by date.

Audience: chefs worldwide, not only Italy. Invoices arrive on paper and their layout varies a lot between suppliers, so AI interpretation is the primary path (structured e-invoice formats such as Italy's SdI XML are out of scope).

## Decisions

From the user (2026-10-14):

- Both entry modes: a photo in the kitchen when goods arrive, and batches of PDFs later.
- The price calculation must include tax (IVA/VAT/GST), whose rate varies per product.
- A "Facturas" section under the product bank in Casa, invoices grouped by supplier and ordered by date.
- The model must interpret product names, which often vary slightly between invoices.
- The app keeps a copy of the real photo or PDF.
- Unmatched lines: in review they default to "create as draft product"; the chef can switch to "connect to existing" or "ignore".
- Who can scan, review, apply and see invoices: the roles that already hold `manage_products` (admin, chef_executive, sous_chef).
- Matching approach C: AI reads; the app matches by rules; AI takes a second look only at doubtful lines.

Carried over from 2026-08-05 (still valid):

- Variants are separate products grouped by family (attributes), not a variant model.
- Bank price = last price paid.
- Price change under 20% is pre-selected; 20% or more needs an explicit tick.
- The invoice is archived with its file.
- A recipe stays pinned to its variant unless changed manually.
- Calibre is shown in the bank, not in the recipe.
- Unsafe unit conversion: no price is proposed (manual entry).
- Few invoices carry an article code, so the normalized description is the primary key, not a fallback.

Noted concern (user decided anyway): where purchase tax is deductible, true food cost excludes tax, so costs will read 4–22% higher. Net price and rate are stored separately, so this can be switched later without data loss. No switch is built now.

## Current state (main, 2026-10-14)

- `Product` (`packages/db/prisma/schema.prisma:669`): `precioCompra` (cents, per `unidadCompra`), `unidadCompra` in `kg|g|l|ml|unidad|caja`, free-text `proveedor`, `precioActualizadoAt`, `estado` with `borrador`, soft delete. No pack-content field: a `caja` has no defined content.
- `ProductPriceHistory` (`schema.prisma:798`) exists, with no document reference.
- Recipe cost is computed on read (`apps/api/lib/products/cost.ts:276`, called from `apps/api/lib/projections.ts`), so a price change reaches every recipe with no extra work.
- Recipe import pipeline is reusable: `fileMatchesMime`, `inferMime`, `visionParts`, `generateGlmJson` (with budget reservation), the broken-JSON retry, `reserveAiCall`, `loadMatchCandidates`, `findMatch`. Mobile picker and upload flow in `apps/mobile/app/recetas/cargar.tsx` and `apps/mobile/src/api/recipes.ts` (`FileSystem.uploadAsync`).
- Branch `feat/escaner-facturas` (`0e853af`) holds no scanner code, only `packages/shared/src/atributos.ts` and the `ambiguo` match level. It is 261 commits behind main and its route edits conflict with the unified extraction pipeline (`33681bb`). Port those pieces by hand; do not merge the branch.

## Data model

New models, all scoped by `restaurantId`:

- **Supplier**: name, normalized name (unique per restaurant), optional tax id (format varies by country).
- **Invoice**: supplier, number, date, net total, tax total, gross total, uploaded by, status `reading | review | applied | failed`, failure reason, `deletedAt` (trash, same as products). Has one or more **InvoicePage** rows (ordered file references: photo or PDF).
- **InvoiceLine**: raw description, code, quantity, unit, pack content, unit price, tax rate %, line total, matched product, match level, and the chef's action `update_price | create_draft | connect | ignore`, plus the applied price.
- **SupplierItem** (supplier memory): supplier + code, or supplier + normalized description → product; pack content (for example `cassa = 5 kg`); last price. Unique on `(supplierId, code)` and `(supplierId, descriptionNorm)`.

Changes to existing models:

- **Product**: add `taxRatePct` (default 0). `precioCompra` stays net. Recipe cost includes tax. Existing products start at 0%, so no current cost changes until an invoice or the chef sets a rate.
- **ProductPriceHistory**: add optional `invoiceLineId`, so the history shows which invoice set the price.
- Port `atributos.ts` (origin and calibre as attributes) and the `ambiguo` match level from the old branch.

## Flow

1. **Upload.** Camera (several photos = pages of one invoice), gallery, or one or more PDFs (each PDF = one invoice). Files are stored, the invoice is created in `reading`, and the request returns at once. The chef does not wait on the screen.
2. **Read (background).** Each page is read separately by the vision model into a schema (header plus lines), with one retry on broken JSON. Pages are merged; the header comes from page 1. Each page call counts against the daily AI quota and the generation budget.
3. **Check.** The sum of lines is compared with the invoice total. A mismatch shows "a line may be missing". The same supplier plus number as an existing invoice shows "this invoice is already loaded".
4. **Match** (approach C), per line, in order: supplier memory (code, then normalized description); fuzzy match with attributes (`findMatch` + `atributos`); for lines still unmatched or ambiguous, one short AI call with only the top 5 candidates, which proposes one or none.
5. **Propose.** The price is converted to the bank unit using pack content.
   - Change under 20%: `update_price` pre-selected.
   - Change of 20% or more: highlighted, needs an explicit tick.
   - No product: `create_draft`.
   - Unsafe conversion: no price proposed.
   - Invoice date older than the product's current price date: the price is not overwritten (last price paid wins).
6. The invoice moves to `review`.
7. **Apply.** One transaction: prices, price history linked to the line, new draft products, supplier memory, invoice set to `applied`. It applies once even if two people review at the same time, and re-checks products deleted meanwhile.

## Screens (mobile)

- **Casa**: a "Facturas" entry under "Banco de productos", visible to `manage_products` roles.
- **Invoice list**: a "Scan invoice" button; a "To review (n)" band; invoices grouped by supplier, newest first; each row shows date, number, total and status.
- **Scan**: camera, gallery or PDF; with the camera, "Add another page" and "Done".
- **Review invoice**:
  - Header (supplier editable or picked from existing suppliers, number, date, total, warnings).
  - One card per line: paper text, matched product with attributes, price before → after with % change, tax %, action.
  - Sheets: the existing `ConfirmMatchSheet`, and `PickVariantSheet`, which is finished here.
  - "View original" opens the pages, and an "Apply" button sits at the bottom.
- **Applied invoice**: read-only, with the pages and what was done per line.
- **Product detail**: price history entries that came from an invoice open that invoice.

## Errors

- **Unreadable photo, not an invoice, AI down, or quota or budget exhausted**: `failed` with a plain reason, plus "Retry" (re-reads stored files) or delete.
- **Stuck in `reading`**: after a timeout the invoice moves to `failed` with Retry.
- **Apply**: all or nothing; idempotent per invoice.
- **Privacy**: invoice files are visible only to members of the restaurant.

## Testing

Test-first for every pricing rule:

- pack conversion;
- tax;
- the 20% threshold;
- an older invoice not overwriting the price;
- the totals check;
- duplicate detection;
- supplier memory.

Beyond the rules:

- route tests with the AI mocked;
- `apply` on real PostgreSQL (integration suite);
- mobile screen tests.

## Delivery order

0. **Feasibility gate.** Use 5–8 real invoices from different suppliers (paper photo, digital PDF, scanned PDF). Measure whether every line is read. Stop if it fails.
1. Port attributes and the `ambiguo` level; finish `PickVariantSheet` on mobile.
2. Data model and `taxRatePct` in recipe cost.
3. API: upload, background read, checks, matching, proposal, apply.
4. Mobile: the Facturas section, scan, review and apply.
5. Price history linked to invoices.

## Open technical points (resolve in the implementation plan)

- Private file storage: photos use Vercel Blob today (`apps/api/lib/blob.ts`). Confirm a private-access option, or serve invoices through an authenticated route.
- Background execution on Vercel: a mechanism and time limit for multi-page reads (for example `after()` with a raised `maxDuration`).
- Currency: invoices are assumed to use the restaurant's currency.
