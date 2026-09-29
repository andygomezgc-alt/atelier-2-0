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

- [ ] M1 — recetas recientes siempre
- [ ] M2 — tope 8192 + test config real
- [ ] M3 — "Volver a aprender"
- [ ] M4 — tendencia mala + mínimo 2
- [ ] M5 — historial por bloques
- [ ] M6 — aprender al encender

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
- Previsión: ~500 líneas (con tests). Estrategia: `exception-ok`, un PR cohesionado; Andy delegó la decisión.
- Límite revisado (RDD): arranca en el punto de rama 2146e54.

## Progreso y evidencia
_(se completa por tarea: commit, comprobaciones, evaluación RDD)_

## Siguiente paso
Ola O1: M3 (Codex) ‖ M4 (Sonnet).
