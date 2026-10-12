# Tuteo en las páginas web de apps/api

- **Rama:** `fix/tuteo-paginas-web` (sale de `main` 68e3f53), worktree `.claude/worktrees/tuteo-api`
- **Origen:** seguimiento de `registro-tuteo` (12-10-2026). El 13-10-2026 Andy pidió hacerlo y lo limitó a las páginas web.
- **Espejo en Engram:** `odd/tuteo-paginas-web/tasks`

## Objetivo
Que las páginas web públicas de Atelier traten al usuario de tú, como la app.

## Problema
Tres páginas que sirve `apps/api` siguen en voseo: `app/privacidad/page.tsx` (18 líneas), `app/terminos/page.tsx` (1) y `app/cuenta/eliminar/page.tsx` (7). Por ejemplo: «escribí a ese email», «podés cancelarla cuando quieras», «Andá a Perfil → Eliminar cuenta y confirmá».

## Por qué
La app y la landing ya usan el tuteo (decisión del 12-10-2026, Engram `atelier/i18n-es-registro`).

## Decisiones
- Solo las páginas web (Andy, 13-10-2026). Quedan igual:
  - los textos que se envían a la IA (`lib/recipe-extraction.ts`, `lib/pdf/theme-generate.ts`, `lib/pdf/reference-geometry.ts`, `lib/pdf/style-extract.ts`);
  - los dos errores que solo recibe el modelo (`lib/pdf/font-validation.ts:3`, `lib/pdf/theme-render.ts:65`).

  No producen texto en voseo para el chef, y cambiarlos puede alterar cómo se extraen las recetas o se diseña la carta.
- Solo cambia el tratamiento (vos → tú). Privacidad y términos son texto legal: su contenido no cambia.
- Las fechas de «Última actualización» no cambian, porque el contenido es el mismo.

## Alcance autorizado
Las tres páginas y un test nuevo en `apps/api`. Fuera de alcance:
- los textos para la IA;
- los scripts de desarrollo («Re-corré con --apply»);
- el prompt congelado de las evals (`evals/prompt-asistente/baseline-prompt.md`);
- los comentarios de código.

## Restricciones
- TDD estricto (fuente: `~/.claude/CLAUDE.md`). Runner: `vitest run` (`pnpm -C apps/api test`).
- Conventional Commits sin atribución de IA.
- Entrega: `ask-on-risk` (por defecto). Previsión: unas 140 líneas en un solo PR.

## Tareas
- [x] T1 — las tres páginas en tuteo, con su test. Ruta: delegada, un escritor (Opus). Disparadores: escritura en cuatro archivos (las tres páginas y el test) y lectura de preparación de las páginas.

## Criterios de aceptación
- Ninguna de las tres páginas trata al usuario de vos.
- El contenido legal, los enlaces y las fechas no cambian.

## Comprobaciones
- `pnpm -C apps/api test`, `pnpm -C apps/api typecheck`

## Progreso y evidencia
- Línea base (68e3f53): API, 106 archivos y 1397 tests; typecheck sin errores. Corriendo la suite a la vez que el typecheck, dos suites fallaron por tiempo de espera; solas pasan.
- Mapa, solo de lectura: fuera de `es.ts`, el único voseo que ve un usuario está en estas tres páginas. Son 29 formas en 26 líneas.
- Test nuevo: `apps/api/app/__tests__/public-pages-tuteo.test.ts`, con un test por página. Lee el código de cada página sin los comentarios y busca 25 formas de voseo como palabras enteras.
- RED, observado por el supervisor con las páginas sin cambios: fallan los 3 tests. Encuentran 19 formas en privacidad, 1 en términos y 9 en borrar cuenta.
- GREEN, repetido por el supervisor: test nuevo 3/3; API, 107 archivos y 1400 tests; typecheck sin errores.
- Diff: 26 líneas en las tres páginas. Un script del escritor confirmó que solo cambian las 29 formas: ni la puntuación, ni el marcado, ni los enlaces, ni las fechas, ni los saltos de línea.
- Commit de T1: `993703c` (139 líneas). RDD sobre `993703c` (base `68e3f53`): riesgo medio por `executable_change` en el test nuevo. `review_due: false` por `under_budget`.

## Siguiente paso
- Preflight de RDD al cerrar. Después, el PR a `main`, que decide Andy.
- Seguimiento, fuera de alcance: el asistente responde con el trato que usa el chef (tú, vos o usted), según `apps/api/lib/anthropic-system.md:25`, y la eval `registro-voseo` lo exige. Si se quiere que responda siempre de tú, es otra decisión.
