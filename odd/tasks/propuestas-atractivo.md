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
| T1 | S1 | inline | pending | |
| T2 | S2 | inline | pending | |
| T3 | S3 | inline | pending | |

Route evidence: one parent, inline. Writer trigger (a) does not hold: T2 and T3 both edit `recetas.tsx` and `menus.tsx`, and all three share the i18n files.

## Log

- L1 (2026-10-19, user): "Sí, arrancá con las propuestas 3, 1 y 5 desde main y dejá la 2 (dictado en Inicio) para después de probar el color."
- L2: Engram mirror `odd/propuestas-atractivo/tasks` pending — `mem_save` refused with "host session already ended".
