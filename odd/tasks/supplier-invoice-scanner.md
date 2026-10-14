| done | 3c50619 || done | 786787f || done | 4485260 || done | 59b6968 || done | 56e6fba || done | 11c9590 || done | f280aae || done | a80e6b8 |# Supplier invoice scanner — Plan 1 (foundations)

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
