# Arreglos del banco de pruebas del prompt

- **Rama:** `fix/eval-prompt-asistente` (desde `main` `d3d797f`)
- **Espejo Engram:** `odd/eval-prompt-arreglos/tasks`
- **Origen:** revisión adversarial posterior a la fusión de los PR #35 y #36 (12-10-2026); Andy pidió arreglarlos.

## Objetivo
Que el banco de pruebas del prompt del asistente (`apps/api/evals/prompt-asistente/`) no puntúe mal respuestas correctas ni compare variantes calificadas con configuraciones distintas.

## Problemas confirmados (3 de 3 escépticos)
1. **Cantidad primero con comillas de código** (`checks.ts:52`): `quantityFirstShare` limpia `*`, `_` y espacios, pero no la comilla invertida. Un ingrediente como `` - `1400 g celeriac` `` cuenta como si no pusiera la cantidad primero. El propio prompt enseña ese formato (`` `8 g sal fina` ``). Visto en una corrida real: 1 de 128 notas cambiada, en la variante baseline.
2. **Variantes no comparables en paralelo** (`run.eval.ts`, comprobación de hermanas): la comparación entre variantes solo mira filas que otra variante ya escribió. Si dos variantes arrancan a la vez con distinto juez, esfuerzo o modelo, ninguna ve filas de la otra y el informe las compara sin avisar.

## Alcance y restricciones
- Solo `apps/api/evals/prompt-asistente/`. Sin cambios en producción ni en el CI.
- No se tocan corridas guardadas de otras sesiones (`.claude/hillclimb`, `.claude/worktrees`); el cambio de `checks.ts` cambia la huella y las corridas viejas quedan marcadas como de otra versión, que es lo correcto.
- TDD estricto: modo ON (`~/.claude/CLAUDE.md`), runner `vitest run` (`pnpm -C apps/api exec vitest run evals/prompt-asistente/<archivo>`).

## Tareas
| ID | Tarea | Ruta |
|---|---|---|
| T1 | `quantityFirstShare` ignora las comillas de código alrededor del ingrediente; test con ingredientes entre comillas | Delegada (escritor del workflow) |
| T2 | Manifiesto atómico por carpeta de corrida con la configuración compartida; una variante con otra configuración se rechaza aunque arranque a la vez; módulo pequeño con tests | Delegada (el mismo escritor, en serie) |

- [x] T1 — comillas de código (`34c281f`)
- [x] T2 — manifiesto de la corrida (`2044458`)

## Criterios de aceptación
- T1: una receta con todos los ingredientes en `` `cantidad nombre` `` cuenta como cantidad primero; los demás casos de `checks.test.ts` siguen igual.
- T2: la primera variante que arranca crea el manifiesto de forma atómica con su contenido completo; una segunda con la misma configuración sigue; una con otra configuración se rechaza antes de cualquier llamada, también si arrancan a la vez; las carpetas ya existentes sin manifiesto siguen funcionando.

## Comprobaciones
- `pnpm -C apps/api exec vitest run evals/prompt-asistente` (tests unitarios del banco)
- `pnpm -C apps/api exec tsc --noEmit` y `pnpm -C apps/api exec vitest run`
- `git diff --check`

## Progreso y evidencia
- Ejecución con un workflow: escritor (Opus 5.5, el modelo de la sesión) con TDD estricto y revisión adversarial (3 revisores, 3 escépticos por hallazgo).
- **T1** (`34c281f`). RED: 2 fallos en `checks.test.ts` (`share: 0` con ingredientes entre comillas de código). GREEN: 27/27 en el banco. Efecto colateral aceptado: ``` `Para el caldo:` ``` entre comillas también cuenta como etiqueta de grupo.
- **T2** (`2044458`). `manifest.ts` con `ensureRunManifest`: temporal propio y `linkSync` al nombre final (aparece completo o no aparece); `EEXIST` compara; distinta huella o manifiesto ilegible, error antes de cualquier llamada. Huella: `id:shared` de todos los casos y modos, ordenados. RED: módulo inexistente y, contra una versión ingenua (comprobar y luego escribir), la prueba de carrera falló 3 de 3 (8 «ganadores»). GREEN: `manifest.test.ts` 6/6 tres veces; prueba en seco sin red: variante con otro esfuerzo del juez rechazada, con la misma aceptada, carpeta antigua sin manifiesto aceptada. `manifest.ts` no entra en la huella del banco (no decide cómo se califica una fila).
- **Revisión adversarial:** 4 hallazgos, ninguno confirmado. El más votado (1 de 3): el manifiesto ata la carpeta a la lista completa de casos, así que añadir un caso obliga a usar otro `EVAL_RUN`; se acepta como decisión, porque comparar variantes sobre conjuntos de casos distintos tampoco es comparable.
- **Comprobación del padre:** banco 33/33 tres veces; api 104 archivos, 1289/1289; tsc OK; solo cambian archivos de `apps/api/evals/prompt-asistente/`; no quedó `.claude/hillclimb`.
- Requisito anotado: la prueba de carrera usa `worker_threads` que importan `.ts` directamente (Node 22.18+; el CI usa Node 24).
