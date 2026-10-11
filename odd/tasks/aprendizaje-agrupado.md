# Aprendizaje agrupado tras cargas

- **Rama:** `feat/aprendizaje-agrupado` (desde `main` `3cc6ff2`)
- **Espejo Engram:** `odd/aprendizaje-agrupado/tasks`
- **Origen:** seguimiento de la entrega 3 (memoria encendida), aprobado por Andy el 11-10-2026 («hazlo ahora»).

## Objetivo
Que una ráfaga de recetas cargadas cueste una sola llamada de pago a la IA en vez de una por receta, sin dejar de aprender sin esperar al cron semanal.

## Problema (comprobado en el código)
- `POST /api/recipes` lanza con `after()` un `learnAfterImport` por cada receta cargada nueva en prueba o aprobada (`apps/api/app/api/recipes/route.ts:23-29`, `:64-66`); cada corrida con evidencia nueva paga una llamada a GLM (`worker.ts:234-246`).
- 20 cargas a 30 s de distancia dan unas 20 llamadas; si una corrida dura más que la distancia entre cargas, además se paga y se descarta (`memory_sources_changed`).
- El `AbortSignal.timeout` se crea antes de `after()` (aviso R3 de la revisión de la entrega 3).

## Restricciones
- Vercel Hobby con Fluid Compute: máximo 300 s por función; el cron corre una vez al día (05:00 UTC). La espera tiene que caber dentro de una función.
- No tocar las puertas de `processMemory`, la supresión de A9, el arriendo de 120 s, las vallas de publicación ni la cadencia semanal de las filas normales.
- Migración solo aditiva, con nombre que no choque con las expresiones de los tests de migraciones y que ordene después de `20261010120000_memoria_encendida`.
- TDD estricto: modo ON, fuente `~/.claude/CLAUDE.md`, runner `vitest run` (`pnpm -C apps/api exec vitest run <archivos>`). RED observado antes de implementar.

## Diseño elegido (panel de 3 diseños y 3 jueces; ganó el robusto 2 a 1, con injertos)
1. **Ticket en la transacción de la receta.** `CulinaryMemory.importTicket Int @default(0)` y `importPendingAt DateTime?`. En `saveNewRecipe`, solo para cargas nuevas en prueba o aprobadas y con la memoria encendida, se incrementa el ticket y se fija `importPendingAt = now` en la misma transacción (una sola ida y vuelta si se puede: `UPDATE … RETURNING`). Devuelve `importTicket` (o `null`: reintento reutilizado, borrador, memoria apagada o sin fila). Sin ticket no se programa `after()`.
2. **Plazo absoluto.** La ruta toma `startedAt` al empezar y pasa `deadline = startedAt + 270 s`; `maxDuration = 300`. La señal se crea dentro de `after()` a partir del plazo (cierra el aviso R3).
3. **Espera con comprobación.** `learnAfterImport(restaurantId, { generator, config, ticket, deadline, quietMs = 170 s, checkMs = 15 s, pollMs = 3 s })`: duerme hasta 170 s en tramos de 15 s; tras cada tramo lee el ticket y, si cambió, devuelve `"debounced"` (sin escribir, sin arriendo, sin pago). Si al final del silencio quedan ≤ 60 s de plazo, devuelve `"deferred"` (no empieza una llamada que no puede terminar). Si no, el bucle actual de `processMemory(…, { afterImport: true })`, comprobando el ticket también en cada espera por bloqueo.
4. **Marca durable.** Al terminar, borra `importPendingAt` (con valla por ticket) solo si el resultado es `completed`, `unchanged`, `suppressed` o `skipped`; la deja en `failed`, `superseded`, `deferred` o si hay excepción.
5. **Recuperación en el cron (una vez como máximo).** El cron selecciona también filas con `importPendingAt` de más de 10 min. Para esas, primero borra la marca con valla por ticket y, si lo consigue, corre `processMemory(…, { afterImport: true })` una vez; las demás filas siguen el camino semanal de siempre.
6. **Observabilidad.** `culinary_memory_import_run` registra `result` y `elapsedMs`. Firma esperada de una ráfaga: N−1 `debounced` y 1 `completed`.

`MemoryRunStatus` no cambia: `"debounced"` y `"deferred"` solo existen en el tipo de retorno de `learnAfterImport`.

## Tareas
| ID | Tarea | Ruta | Motivo |
|---|---|---|---|
| T1 | Ticket y marca: esquema, migración, `saveNewRecipe` y sus tests | Delegada (escritor Opus 5.5 alto) | Disparador de escritura: varios archivos no triviales |
| T2 | Espera con comprobación en `learnAfterImport` y ruta con plazo absoluto | Delegada (el mismo escritor, en serie) | Concurrencia y plazos |
| T3 | Recuperación una vez en el cron | Delegada (el mismo escritor, en serie) | Toca la selección del cron |
| T4 | Documentación (este plan, `docs/MEMORIA-ENCENDIDA-2026-10.md`, `docs/ESTADO-ACTUAL.md`) | Padre | Textos |

- [x] T1 — ticket y marca (`119dac2`)
- [x] T2 — espera con comprobación y plazo absoluto (`6d6deec`)
- [x] T3 — recuperación en el cron (`132a73b`)
- [x] T4 — documentación (este commit)

## Criterios de aceptación
- 20 cargas a 30 s: una sola llamada al generador (19 `debounced`); prueba de integración en Postgres real.
- Dos cargas separadas más que la ventana: dos llamadas (comportamiento documentado).
- Sin ticket (borrador, reutilizada, memoria apagada): sin `after()`.
- La señal no se crea en el manejador; el plazo se ancla al inicio de la petición; `maxDuration` 300 y el presupuesto 170 + 40 (peor manejador) + 60 ≤ 270 fijado en un test.
- Una marca huérfana de más de 10 min se aprende una vez en el cron y no se repite; las filas sin marca mantienen la cadencia semanal.
- `processMemory`, A9 y el arriendo sin cambios; los tests existentes siguen verdes.

## Comprobaciones por tarea
- `pnpm -C apps/api exec tsc --noEmit` y `pnpm -C apps/api exec vitest run`
- `pnpm -C packages/db exec prisma validate` si se toca el esquema
- Integración: `CULINARY_MEMORY_IT=1` contra un Postgres desechable local (puerto 54329)
- `git diff --check`

## Entrega
- Previsión: unas 450 líneas con tests. Estrategia `ask-on-risk`; si pasa de unas 400, PR encadenados como en la entrega 3.
- Al fusionar, Vercel aplica la migración; no hace falta binario nuevo (solo servidor).

## Progreso y evidencia
- **Diseño** (12-10-2026): workflow de 9 agentes: 3 lectores (ruta y worker, límites de Vercel, datos), 3 diseños (mínimo, robusto, coste) y 3 jueces; ganó el robusto 2 a 1, con injertos (comprobación cada 15 s, `elapsedMs`, `deferred`, prueba de cargas separadas).
- **T1** (`119dac2`, escritor Opus 5.5 alto; ruta delegada). RED: 7 fallos (ticket `undefined`, migración inexistente, `after()` sin ticket) y 1 de integración. GREEN: api 1184, integración 23/23. Desvío: la marca se escribe con `AT TIME ZONE 'UTC'` porque el Postgres local está en `Europe/Berlin` y un `Date` crudo se guardaba 2 h desplazado.
- **T2** (`6d6deec`). RED: 12 fallos y, en integración, 20 llamadas para 20 cargas. GREEN: api 1193, integración 25/25 dos veces: 1 llamada, 19 `debounced`, marca borrada; dos cargas separadas, 2 llamadas.
- **T3** (`132a73b`). RED: selección del cron y marca sin borrar; integración sin corrida. GREEN: api 1197, cron 12/12, integración 26/26. El cron ordena primero las marcas huérfanas para que no queden fuera de las 20 filas.
- **Comprobación del padre:** api 1197/1197, integración 26/26, tsc OK.
- **Revisión adversarial** (workflow de 32 agentes: 5 revisores y 3 escépticos por hallazgo): 9 hallazgos, 2 confirmados, ambos de tests: TQ3 (faltaban casos de la regla de la marca: `suppressed` borra, `superseded` y excepción mantienen) y TQ4 (aserción dependiente del reloj real). Arreglados en `0b32b37`; las mutaciones de `IMPORT_SETTLED` y un borrado en `finally` hacen fallar los tests nuevos. `worker.ts` sin cambios desde T3; `worker.test.ts` 49/49 tres veces; api 1200/1200.
- Riesgo anotado fuera de alcance: `apps/api/lib/ai/budget.ts` también escribe `Date` crudos en SQL; en Neon la sesión es UTC, pero se desplazaría si no lo fuera.

## Siguiente paso
Revisión RDD de la rama y entrega (fusión con `main`; Vercel aplica la migración; no hace falta binario).
