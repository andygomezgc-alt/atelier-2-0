# Supplier invoice scanner — Plan 1 (foundations)

Objective: build the foundations of the supplier invoice scanner (reading, totals, gate script, attributes/ambiguo, variant picker, data model, tax in cost, pricing rules). Branch: `feat/supplier-invoice-scanner`. Delivery: ask-on-risk (forecast ~1,600 authored lines → chain strategy asked before PR). Test runner: vitest (api, shared, mobile, i18n).
Design: `docs/superpowers/specs/2026-10-14-supplier-invoice-scanner-design.md`. Plan: `docs/superpowers/plans/2026-10-14-supplier-invoice-scanner-plan-1.md`. Ledger: `.superpowers/sdd/2026-10-14-supplier-invoice-scanner-plan-1/progress.md`.

## Specs

- S1. Both entry modes — user: "las dos cosas".
- S2. Tax in price — user: "el calculo del precio que hace el escaner tiene que tener el iva que que dependiendo del producto va cambiando el porcentaje".
- S3. Invoice archive — user: "en casa tendria que haber una seccion abajo del banco donde vayan quedando acomodadas las facturas por proveedoor ordenadas por fecha" (Plan 2).
- S4. Name variations — user: "muy importante el modelo tiene que interpretar los productos y que a veces se suelen cambiar un poco en los nombres".
- S5. AI-first, worldwide, keep original — user: "es muy necesario que la ia debe interpretar los datos y en el banco se mantiene la una copia con la foto o el pdf real tambien".
- S6. Unmatched lines — user chose option 1 ("vamos con la uno"): default create draft; chef can connect or ignore.
- S7. Roles — user chose "1": admin, chef_executive, sous_chef (manage_products).
- S8. Matching approach — user chose "c": AI reads, rules match, AI second look on doubtful lines with top-5 candidates.
- S9. August decisions still valid (spec "Decisions"): last price paid wins; <20% pre-selected; unsafe conversion → no price; calibre only in bank; few invoices have codes.

## Tasks

| ID | Plan task | Specs | Route | Status | Commit |
|---|---|---|---|---|---|
| T1 | Invoice page extraction | S4,S5 | inline | done | a80e6b8 |
| T2 | Totals check + spike script | S5 | inline | done | f280aae |
| T3 | Port atributos | S4 | inline | done | 11c9590 |
| T4 | ambiguo match level | S4 | inline | done | 56e6fba |
| T5 | Mobile variant picker | S4 | inline | done | 59b6968 |
| T6 | Data model + migration | S2,S3,S5 | inline + independent verifier (Risk item 1) | done | 4485260 |
| T7 | Tax in recipe cost | S2 | inline | done | 786787f |
| T8 | Pricing rules | S2,S9 | inline | done | 3c50619 |

## Log

- L1 (2026-10-14) user: "ahora quiero que planifiquemo juntos los funcionamientos y agamos las conexiones correspondientes"
- L2 (2026-10-14) design approved section by section; spec written (e93c966). User: "Revisé el documento de diseño, está aprobado. Armá el plan de trabajo."
- L3 (2026-10-14) plan 1 written (fded568). User: "Revisé el plan. Ejecutalo vos en esta sesión (nativo), con un revisor independiente al final y para la migración."
- L4 (2026-10-15) T1-T8 done (a80e6b8..3c50619). Focused tests RED→GREEN per task; api 1690+36, mobile 549, shared 537, i18n 94; pnpm typecheck green. T2 gate (real invoices) pending on the user. T6 independent verifier: PASS; migration applied to dev only. Rulings in the ledger. Final independent review running.
- L5 (2026-10-15) Final independent review: 6 Important fixed in one pass (e80c799 pricing: paid price, returns, unpriced products; 887b926 match: confirmed alias, acceptsAmbiguous for older builds, safe picker dismissal), each RED→GREEN. api 1735/1735, mobile 550/550, shared 537/537, i18n 94/94, typecheck green. 7 minors deferred (#5-#9, #12, #13). Next: user's 5-8 real invoices for the T2 gate, then Plan 2.
- L6 (2026-10-15) Rulings and deferred minors (copied from the SDD ledger before deleting it):
  - Setup: Ruling: no separate worktree — work on feature branch feat/supplier-invoice-scanner in the main checkout (user chose native execution here; branch is not main) — cost if wrong: none, main untouched.
  - Task 2: Ruling: Step 8 (real-invoice gate) not run — needs the user's 5-8 invoices; blocks Plan 2 only — cost if wrong: none, tracked as pending.
  - Task 4: Ruling: match route conflict — main no longer imports parseIngredient and match-ingredients.ts does not exist on main; inlined the candidate select with precioCompra/unidadCompra instead of MATCH_CANDIDATE_SELECT — cost if wrong: none, same fields.
  - Task 4: Ruling: the pipeline "ambiguo stays unlinked" test passed on first run — it pins existing behaviour (pipeline links only exact), as the plan intended; not a RED — cost if wrong: none.
  - Task 5: Ruling: PickVariantSheet test used a top-level 'token' inside a hoisted vi.mock (ReferenceError); inlined the Proxies in the factory, then re-ran RED (component moved aside → 'Cannot find module') and GREEN — cost if wrong: none.
  - Task 6: Ruling: `prisma format` reformatted the whole schema (181-line churn) — reverted and re-applied edits without formatting — cost if wrong: none.
  - Task 6: Ruling: Step 4 (apply to dev DB ep-summer-heart) deferred until the independent migration verifier returns PASS (user asked for a reviewer "para la migración"); commit 4485260 made, client regenerated locally; typecheck + api 1686/1686 green — cost if wrong: Tasks 7-8 run on a generated client not yet applied to dev, which unit tests do not need.
  - Task 7: Ruling: RecipeIngredientRow.product.taxRatePct typed optional/nullable (mapped to 0) instead of adding it to every projection fixture — Prisma always selects it, and fixtures/mocks without it cost as untaxed (unchanged behaviour) — cost if wrong: a missing select would silently cost untaxed; the select is added in both places.
  - Final: minor (deferred): #5 same-day check uses UTC date, off by one near midnight local time.
  - Final: minor (deferred): #6 20% threshold compares the rounded percentage (19.6% → not pre-selected).
  - Final: minor (deferred): #7 bank unit g/ml can round a price to 0 cents.
  - Final: minor (deferred): #8 lenient number edge cases ("(12.50)", "2 x 5", "1.234") when the model ignores the numeric schema.
  - Final: minor (deferred): #9 one line without total turns the totals check to unknown — check in the real-invoice gate.
  - Final: minor (deferred): #12 product bank realCost stays net while recipe cost is gross once rates > 0 — Plan 2 (tax field).
  - Final: minor (deferred): #13 description > 300 chars drops the line; > 200 lines or lines:null fails the page.
  - Final: Ruling: #4 older builds (no acceptsAmbiguous) get the first sibling as "probable" to confirm instead of "none" — they cannot show the picker, and confirm/decline never creates a duplicate — cost if wrong: an old build may link the wrong sibling if the chef taps yes without reading.
- L7 (2026-10-15) user: "te dejo las fotos de algunas facturas" — T2 gate run on 8 photos (7 documents, 6 suppliers: Recchioni, Ittica De Dominicis, Scelgo x2 pages, MARR, Jolanda de Colo', DAC, Garden Fruit), glm-5.3-flash, 3-9 s per page.
  - Gate verdict: viable. 7/7 documents read (Recchioni after one retry); every unit price, quantity and line total matched the paper on 26/27 product lines (exception: Garden Fruit fagiolini qty 2.5 vs 2.58); tax rate right on all lines where read (4/10/22). Totals ok on 5, unknown on 3.
  - Findings for Plan 2: (G1) one transient ai_provider_http_400 with no body logged — retry once and log the body; (G2) continuation lines become fake lines (scientific name / FAO zone, "VENDITA MERCE" header, crate deposit "differenza cauzionale") — merge into the previous description or propose ignore, never create a draft for a line with no unit price; (G3) pack content stays in the description ("kg 1,75 - pz24", "G 1100 X 4", "Kili: 4,000" for 10 CF) so PZ/CF lines would price per box as per unit — extract packQty/packUnit and map CF/conf to box; (G4) multi-page documents (Scelgo: lines on page 1, totals on page 2) need totals checked per invoice, not per page; (G5) the model fills netTotal from its own lines when only the gross is printed (Recchioni, DAC) — so "ok" is not proof; (G6) Garden Fruit VAT column (04) not read and one NR line read as KG; (G7) a header line with null total turns totals to unknown (confirms minor #9).
- L8 (2026-10-15) user: "Sí, escribí el Plan 2 incluyendo los 7 ajustes del control con facturas reales." Plan 2 written: `docs/superpowers/plans/2026-10-15-supplier-invoice-scanner-plan-2.md`, 17 tasks, API only (mobile = Plan 3). Covers G1-G7 (Tasks 1-4, re-checked on the same photos in Task 17), minors #5 #6 #7 #9 #13, and the migration verifier advisories. #8 stays deferred; #12 goes to Plan 3. One migration (Task 7, `uploading` status): independent verifier, then dev DB only. Open point: Task 8 smoke test decides if the current Blob store takes private files (if not, Needs your decision: a private store and INVOICE_BLOB_READ_WRITE_TOKEN). Waiting for the user's review of the plan and the execution method.
- L9 (2026-10-15) user: "Revisé el Plan 2. Ejecutalo vos en esta sesión (nativo), con un revisor independiente al final y para la migración." Plan 2 Tasks 1-16 executed inline (commits a04ce77..d1c3cfb); migration `20261016090000_invoice_uploading_status` verified independently (PASS) and applied to dev only.
  - Task 17 gate, same 8 photos as 7 documents (Scelgo 2 pages together), glm-5.3-flash, 4-17 s per document:
    - G1 met: no document failed; no retry was needed in this run.
    - G2 met for fake lines: no scientific-name / FAO / "VENDITA MERCE" lines, continuation text merged into descriptions. Not met for the Garden Fruit crate deposit: the model omitted the line instead of reading it as a `charge`; the totals check catches it (mismatch -258).
    - G3 met: "kg 1,75 -pz24" → pack 24 pz; "G 1100 X 4" → pack 4.4 kg; "Kili: 4,000" for 10 CF → pack 0.4 kg.
    - G4 met: Scelgo is one document, lines from page 1, totals from page 2, totals ok (diff 1).
    - G5 met: Recchioni, DAC and Ittica show net null; Recchioni checked against the gross → mismatch -580 (lines 484.46 € gross vs 490.26 € printed); DAC gross ok; Ittica unknown (no tax rate read on its line).
    - G6 partly met (model-dependent, recorded only): Garden Fruit tax 4 on every line and NR lines keep NR; fagiolini quantity still 2.5 instead of 2.58 (quantityLooksMisread flags it for the chef).
    - G7 met: no document ended `unknown` because of a header line.
  - Dev apply smoke on real PostgreSQL (ep-summer-heart): first applyInvoice `applied` (1 updated, 1 draft), second `already_applied`; invoice `applied` with appliedAt; 2 history rows; draft `borrador` 1234 kg; supplier memory 2 rows; everything created was deleted and the product's price restored.
  - Suites: api 1912/1912 (137 files), shared 537/537, `pnpm typecheck` clean (api + mobile).
  - Open: the invoice storage smoke (Task 8) is not runnable without a Blob token in `.env.local` → Needs your decision (dev token, or a private store with INVOICE_BLOB_READ_WRITE_TOKEN).
- L10 (2026-10-15) Final independent review (opus) of Plan 2, b8c5ac6..8574a92: Critical 0, Important 3, Minor 7. Fixed in a574da5 with RED→GREEN tests: a concurrent second Apply now answers alreadyApplied instead of 409; the apply transaction gets 30 s (was Prisma's 5 s default); an impossible or future printed date is dropped at read time and a price is never dated after it was applied. Suite api 1919/1919, `pnpm typecheck` clean. Deferred minors: PATCH racing Apply, Blob outage while reading reported as internal_error, orphan file when the page row fails after upload, Retry quota charged to the uploader, "same day" calendar vs noon UTC, detail lines with their own amounts merged, priced draft without unit has no history row. Release gate still open: private-file storage smoke (Task 8) needs a Blob token.
