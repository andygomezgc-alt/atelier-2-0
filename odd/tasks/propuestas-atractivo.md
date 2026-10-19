# Propuestas atractivo (3, 1 y 5)

Objective: make Atelier more attractive for chefs without lowering quality ("la IA hecha solo para chefs").
Branch: `feat/propuestas-atractivo` from `origin/main` (1bafb73), worktree `.claude/worktrees/propuestas-atractivo`. Delivery: ask-on-risk (forecast ~500 authored lines, three work-unit commits). Test runner: vitest (`apps/mobile`, `apps/api`, `packages/shared`, `packages/i18n`).

## Specs

Source: the read-only review accepted by the user on 2026-10-18 ("Propuestas para que Atelier sea más atractivo para el chef", top 5). Quoted fragments are verbatim from that review.

- **S1 — Proposal 3, assistant empty state with suggested starters.** "4-5 chips de tareas reales de brigada ("Escalar esta receta a 40 cubiertos", "¿Qué alérgenos lleva este plato?", "Sustituir un ingrediente de temporada", "Ordenar mi mise en place"). Tocar un chip **rellena el compositor**, no envía."
  Guards: "nunca auto-enviar"; "respetar el modo Diario/Creativo por rol"; "textos en es/en/it (hay test de paridad)"; "lista de chips como constante testeada".
- **S2 — Proposal 1, food cost visible in the recipe list and cost on the menu.** "cada receta muestra su food cost % con color semántico (verde/ámbar/terracota según umbral), y cada carta en servicio muestra costo medio del plato y margen."
  Guards: "para cartas, el cálculo va **en el servidor** con la misma función que usa el detalle y el campo se agrega como opcional/`.default`", "con el mismo chequeo de permiso que recetas"; "Función pura `foodCostTone(pct)` en `src/lib` con test vitest"; "Costo IA: cero."
- **S3 — Proposal 5, skeleton loading and empty states with an action.** "filas fantasma con la misma forma que las tarjetas mientras carga, y "Crear la primera receta" / "Crear la primera carta" como botón en los vacíos."
  Guards: "solo presentación, sin tocar el flujo de datos; respetar "reducir movimiento" del sistema"; reuse the `ensureRestaurant()` creation path; "sin IA". Also named: Facturas spinner colour and missing pull-to-refresh.
  Assumption: the Inicio parts (`inicio.tsx` spinner and empty state) wait, because `feat/inicio-color` rewrites that screen and the user is testing it first.

Out of scope now (L1): proposal 2 (dictation in Inicio), proposal 4.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1 | inline | done | 89c6ca3 |
| T2 | S2 | inline | done | 9ce6106 |
| T3 | S3 | inline | done | 073b3d2 |

Route evidence: one parent, inline. Writer trigger (a) does not hold: T2 and T3 both edit `recetas.tsx` and `menus.tsx`, and all three share the i18n files.

## Log

- L1 (2026-10-19, user): "Sí, arrancá con las propuestas 3, 1 y 5 desde main y dejá la 2 (dictado en Inicio) para después de probar el color."
- L2: Engram mirror `odd/propuestas-atractivo/tasks` pending — `mem_save` refused with "host session already ended".
- L3: T1 GREEN — starter-chips.test.ts 4/4, mobile suite and tsc OK; committed 89c6ca3.
- L4: T2 — RED observed (projection foodCostPct undefined, projectMenuCostSummary missing, route costSummary undefined, contract fields missing, food-cost module missing), then GREEN: api 2000 passed (leave.test.ts hook timeout under full-suite load, passes alone 8/8 — known flake), shared 539, mobile 668, i18n 94; tsc api/shared/mobile OK. Decisions: menu margin is over what the costed dishes charge on that menu ((Σprice − Σcost) / Σprice); only portion-priced dishes with complete recipe cost count; the summary is gated with `can(role, "view_staff_recipe")` and skipped for the trash. High food cost uses `colors.danger` (the palette's dark terracota) so caption text stays readable; the menu cost line stays uncoloured on the teal card.
- L5: T2 Risk: item 2 (permission-gated cost data on `GET /api/menus`). Independent verifier: S2 PASS, no blockers; confirmed no new exposure (all four roles already hold `view_staff_recipe` and see costs in `GET /api/recipes`). Native assess (base 1bafb73, committed-only): risk medium, review_due false, `under_budget`; not escalated, since the verifier found no new exposure. Advisory taken: the coverage text now reads "sobre {priced} de {total} platos" (es), because dishes priced by kg or at 0 are left out of the summary even when their recipe cost is complete.
- L6: T3 — RED observed (SkeletonList module missing; facturas still showed ActivityIndicator and had no RefreshControl; recetas/menus empty slots had no action and showed ActivityIndicator), then GREEN. `SkeletonList` pulses only once the reduce-motion setting is known to be off, and stops when it turns on. Recetas: ghost cards and "Crear la primera receta" through the same `handleCreateRecipe` (ensureRestaurant → /recetas/nueva) as the header button, only for roles that can create and the unfiltered views. Menus: ghost cards and "Crear la primera carta" opening the same NewMenuSheet. Casa: hero-shaped skeleton. Facturas: ghost rows and terracota pull-to-refresh. Inicio untouched (assumption in S3).
- L7: Size: T1 209, T2 329, T3 about 350 authored lines (over the ~400 heuristic in total). Each task is its own commit, so the chain strategy is asked once at delivery.
- L8: Native assess after T3 (base 1bafb73, committed-only): risk medium, review_due false, `under_budget`; no native review. Final checks before the T3 commit: mobile 681, api 2008, i18n 94 passed; mobile tsc OK. Branch pushed to origin. Pending: `graphify update .` in the main checkout after merge (the worktree has no graph); Engram mirror still pending (host session ended); delivery strategy (one PR or a chain T1 → T2 → T3) is the user's call.
