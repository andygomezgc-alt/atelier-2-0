# Mejoras de la memoria culinaria — entrega 1 (arreglos)

- **Rama:** `feat/memoria-culinaria-mejoras` (sale de `main` 2146e54)
- **Espejo Engram:** `odd/memoria-culinaria-mejoras/tasks`
- **Origen:** auditoría del 28-sep-2026 y decisiones de Andy del 29-sep-2026 (Engram `atelier/decisiones-memoria-culinaria-2026-09`)

## Objetivo
Que el chat gaste menos tokens en hilos largos y que la memoria sea más útil para los chefs, sin cambiar el modelo de privacidad (sigue siendo opcional y solo aprende de recetas).

## Problema
- Desde el mensaje 21, la ventana deslizante de 20 cambia el comienzo del historial en cada turno: el hilo entero se reescribe en caché a 1,25× en cada turno.
- Con la memoria encendida, el asistente deja de ver las recetas recientes y puede proponer duplicados.
- Una tendencia mal citada tira la corrida semanal entera.
- El tope de 4096 tokens con razonamiento de GLM 5.3 puede cortar la respuesta, y no hay test con la configuración real.
- Arranque lento: espera al proceso diario y pide 3 recetas por tendencia.
- Soltar una corrección exige ocultar y restaurar la categoría.

## Alcance autorizado
Solo las tareas M1–M6. Fuera de alcance: "Notas del chef" (entrega 2), encender la memoria por defecto, medición en producción.

## Restricciones
- TDD estricto: modo ON, fuente `~/.claude/CLAUDE.md` ("Strict TDD Mode: enabled"), runner `vitest run` (apps/api, packages/shared, apps/mobile). RED observado antes de implementar.
- No tocar `.gitignore` (cambio previo ajeno a esta tarea).
- Textos de interfaz en es/en/it.
- Un solo commit por tarea como mínimo, Conventional Commits en español como el resto del repo.

## Tareas

| ID | Tarea | Ruta | Motivo de la ruta | Archivos |
|---|---|---|---|---|
| M1 | Recetas recientes siempre, también con memoria | Codex (gpt-5.6-sol, xhigh) | Fácil, 2 archivos mecánicos | `lib/anthropic.ts`, `messages/route.ts`, tests |
| M2 | Tope de memoria 8192 + test con la config real | Codex (gpt-5.6-sol, xhigh) | Fácil | `lib/ai/config.ts`, `culinary-memory/provider.test.ts` |
| M3 | Botón "Volver a aprender" | Codex (gpt-5.6-sol, xhigh) | Fácil, solo móvil + i18n | `CulinaryMemorySheet.tsx`, `packages/i18n/src/{es,en,it}.ts` |
| M4 | Descartar solo la tendencia mala + mínimo 2 recetas | Sonnet | Intermedia, varios archivos de la memoria | `culinary-memory/{worker,evidence,provider}.ts`, shared, tests |
| M5 | Historial recortado por bloques | Sonnet | Intermedia, lógica pura con diseño cerrado | `lib/ai/chat.ts`, `messages/route.ts`, tests |
| M6 | Aprender al encender la memoria | Opus 5.5 | Compleja: segundo plano, bloqueos, concurrencia con el cron | `restaurant/culinary-memory/route.ts`, `culinary-memory/*`, tests |

Olas (archivos disjuntos en paralelo): O1 = M3 ‖ M4 · O2 = M1 ‖ M6 · O3 = M2 ‖ M5.

- [x] M1 — recetas recientes siempre (`1db58e0`)
- [x] M2 — tope 8192 + test config real (`de09ef9`)
- [x] M3 — "Volver a aprender" (`c2b8791`)
- [x] M4 — tendencia mala + mínimo 2 (`f4e1fd2`)
- [x] M5 — historial por bloques (`a88e5df`)
- [x] M6 — aprender al encender (`83890d3`)

## Criterios de aceptación
- M1: con memoria encendida, el sistema incluye la memoria (cacheada) y los títulos recientes (bloque dinámico sin caché).
- M2: `memory.maxTokens === 8192`; un test ejercita el modelo por defecto (`glm-5.3-flash`, razonamiento encendido) y comprueba el `max_tokens` enviado y que una respuesta cortada (`finish_reason: length`) se clasifica como `memory_output_invalid`.
- M3: una categoría corregida muestra "Volver a aprender"; al guardarlo, la corrección desaparece sin ocultar la categoría; es/en/it.
- M4: una tendencia con fuentes inválidas se descarta y las demás se publican; una tendencia necesita 2 recetas distintas y la corrida arranca con 2 recetas elegibles.
- M5: con más de 20 mensajes, el comienzo del historial enviado es estable durante varios turnos (anclado a múltiplos de 10 del índice absoluto), nunca más de 20 mensajes ni 40.000 caracteres, y siempre empieza por un mensaje del chef.
- M6: al pasar de apagada a encendida, se lanza una corrida en segundo plano sin bloquear la respuesta; respeta bloqueos y el mínimo de recetas; si falla, queda el cron como hoy.

## Comprobaciones por tarea
- `pnpm -C apps/api exec tsc --noEmit` y `pnpm -C apps/api test`
- `pnpm -C packages/shared exec tsc --noEmit` y `pnpm -C packages/shared test` (si se toca shared)
- `pnpm -C apps/mobile exec tsc --noEmit` (ignorar el TS5101 preexistente) y `pnpm -C apps/mobile test` (si se toca móvil)
- Al cierre: `npx expo export --platform android` en apps/mobile (borrar `dist`).

## Entrega
- Previsión: ~500 líneas (con tests). Real: 755 líneas (663+ / 92−, 26 archivos, más de la mitad tests). Estrategia: `exception-ok`, un PR cohesionado; Andy delegó la decisión.
- Límite revisado (RDD): arranca en el punto de rama 2146e54.

## Progreso y evidencia
- **Codex en esta máquina:** con `--write` no puede lanzar procesos (`CreateProcessAsUserW failed: 5`). Se usa como autor: recibe el código en el prompt, devuelve ediciones exactas y un Sonnet operador las aplica y corre RED/GREEN. La config de Codex apunta a `gpt-6-astra`, que el CLI 0.144.4 no soporta; se pasa `--model gpt-5.6-sol --effort xhigh` por tarea sin tocar la config.
- **M4** (`f4e1fd2`, Sonnet). RED: 8 tests fallando; luego 5 más en la validación por tendencia. GREEN: api 725/725, tsc OK; spot check del padre: 101/101 en memoria/cron/restaurant. Añadido tras la revisión del padre: el proveedor valida cada tendencia por separado. `memory.integration.test.ts` no se corrió (requiere Postgres, `CULINARY_MEMORY_IT=1`).
- **M3** (`c2b8791`, Codex autor + Sonnet operador). RED: falta el módulo; GREEN: 2/2; móvil 156/156, tsc móvil e i18n OK. El padre cambió además `memory_empty` de 3 a 2 elaboraciones (es/en/it).
- **RDD M4:** evaluación `high` (process_boundary en memory.integration.test.ts); Andy dio consentimiento; revisión `review-2c728801199705bd` iniciada. Los 4 revisores fallaron con `401 OAuth access token is invalid` porque el CLI `claude` de la máquina no tiene sesión. Pendiente: reintentar tras el login, o revisar el tramo completo al final.

- **M1** (`1db58e0`, Codex autor + Sonnet operador). RED 2+1; GREEN 43/43; api 741/741, tsc OK. Spot check del padre: 43/43.
- **M6** (`83890d3`, Opus). `patchCulinaryMemory` devuelve `turnedOn` (transición dentro de la transacción); `after()` + `processMemory` con señal de 60 s; `maxDuration = 90` (otras rutas en producción usan 300). Lo que evita la doble corrida es la reserva condicional del worker (el lock se limpia en cada edición). RED 11; GREEN 117; api 741/741, tsc OK. Spot check del padre: 117/117.
- **RDD por el hook de parada:** revisiones `review-3266283ab3b12801` y `review-f99a63614c250d51` (cambios sin commitear, riesgo medio), las dos con consentimiento de Andy, las dos bloqueadas por el mismo 401 del CLI `claude`.

- **M5** (`a88e5df`, Sonnet). `stableHistoryWindow` corta en múltiplos de 10 del índice absoluto (con `message.count`); si ningún bloque cabe en 40.000 caracteres, vuelve al recorte de antes. RED 14; GREEN 120; api 756/756. Spot check del padre: 64/64.
- **M2** (`de09ef9`, Codex autor + Sonnet operador). RED 1 (8192 frente a 4096); GREEN 12/12. Test con glm-5.3-flash, razonamiento y `finish_reason: length`.
- **Cierre (padre):** api tsc OK y 758/758; móvil tsc OK y 156/156; shared tsc OK y 257/257; i18n tsc OK; `expo export --platform android` OK (bundle generado, `dist` borrado).
- **Pendiente:** 4 revisiones RDD abiertas, bloqueadas por el 401 del CLI `claude`; `memory.integration.test.ts` sin correr (requiere Postgres).

- **RDD tras el login de Andy en el CLI `claude`:**
  - `review-2c728801199705bd` (M4, riesgo alto, 4 lentes): APROBADA y con acuse. Deja 8 avisos no bloqueantes, que quedan como seguimiento:
    - no se registra qué tendencias se descartan;
    - una tendencia mal formada de una categoría excluida cuenta como propuesta;
    - aspectos de legibilidad en worker.ts:168 y provider.ts;
    - el límite inferior en el script de comprobación.
  - `review-f16f403dd01d5e3b` (M3–M2, riesgo medio, 1 lente): APROBADA y con acuse. Los 2 avisos se verificaron y no aplican en la práctica: el `catch` libera el turno, el historial nunca está vacío y solo existen los roles user/assistant.
  - `review-91284509b99b37ed` (`.gitignore` de Andy): APROBADA y con acuse.
  - Siguen abiertas 3 revisiones de estados intermedios del árbol que ya no existen; no bloquean nada.

## Siguiente paso
Andy decide PR, merge y deploy. La entrega 2 ("Notas del chef") queda pendiente.
