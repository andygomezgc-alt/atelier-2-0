# Memoria declarable — el chef declara su cocina en «Nuestra cocina»

- **Rama:** `feat/memoria-declarada` (sale de `origin/main` 15d2c42), worktree `.claude/worktrees/memoria-declarada`
- **Origen:** 12-10-2026. Andy decidió: «que el chef pueda declararlo y gane sobre lo aprendido». Esto reemplaza la decisión #211.1. Después aprobó el diseño («sí, me cierra»). Diagnóstico en Engram: `atelier/memoria-culinaria-diagnostico-2026-10`.
- **Espejo en Engram:** `odd/memoria-declarada/tasks`

## Objetivo
Que el chef pueda declarar en «Nuestra cocina» cualquiera de las 7 categorías de la memoria, sobre todo el registro de su cocina (clásica, contemporánea o vanguardia), y que lo declarado gane sobre lo aprendido. El asistente usa esa señal para adaptarse al estilo de cada chef.

## Problema
- El extractor casi nunca produce las categorías «cuisine» ni «complexity», y no existe una clave de registro.
- La pantalla muestra las tendencias sin su categoría, solo deja corregir lo que ya se aprendió y restaura todas las categorías ocultas de golpe.
- La API ya acepta correcciones de las 7 claves (`PatchCulinaryMemorySchema`), que llegan al chat al instante como `indicadasPorElChef`. Lo que falta es la pantalla.

## Diseño aprobado
- «Lo aprendido» pasa a llamarse «Cómo cocinamos». Muestra las 7 categorías con su nombre (Cocina, Ingredientes, Técnicas, Sabores, Texturas, Presentación, Complejidad), cada una en uno de tres estados:
  - Declarado: el texto del chef, con «Editar» y «Volver a aprender».
  - Aprendido: con «Editar», que la pasa a declarado, y «Ocultar».
  - Sin datos: con «Declarar».
- En «Cocina» hay tres atajos de registro (Clásica o de tradición, Contemporánea, Vanguardia o de autor) que completan el texto, de hasta 160 caracteres.
- Las categorías ocultas se restauran de a una.
- Textos en es/it/en.

## Alcance autorizado
- La app móvil: `apps/mobile/src/components/CulinaryMemorySheet.tsx`, `apps/mobile/src/lib/culinary-memory-draft.ts` si hace falta, `packages/i18n/src/{es,it,en}.ts` y los tests de móvil e i18n.
- Fuera de alcance: el servidor, la base de datos, el extractor y el prompt.

## Restricciones
- TDD estricto (fuente: `~/.claude/CLAUDE.md`). Runner: `vitest run` (`pnpm -C apps/mobile test`).
- Conventional Commits sin atribución de IA.
- Entrega `ask-on-risk`. Previsión: unas 300-400 líneas en M1.

## Tareas
- [x] M1 — la pantalla «Cómo cocinamos» con declarar, estados, atajos de registro y restauración individual, más i18n y tests. Ruta: delegada, un escritor (Opus). Disparador: dos o más archivos no triviales (componente, i18n y tests).
- [ ] M2 — casos gemelos en la prueba del prompt (lo declarado frente a sin memoria, y un conflicto). Necesita la prueba en `main` (PR #36).
- [ ] M3 — entrega: commits, PR y build de Android.

## Criterios de aceptación
- Con la memoria vacía, las 7 categorías aparecen con su nombre y un botón «Declarar».
- Declarar «Cocina» con un atajo deja un texto que empieza con el registro, y al guardar viaja como corrección con `key: "cuisine"`.
- Lo aprendido se puede ocultar, y cada categoría oculta se puede restaurar por separado.
- El sous-chef ve la pantalla sin poder editar.

## Comprobaciones
- `pnpm -C apps/mobile test`
- `pnpm -C apps/mobile typecheck` (ignorar el TS5101 preexistente)
- `pnpm -C packages/i18n test`
- `npx expo export --platform android`

## Progreso y evidencia
- M1, delegada a un escritor Opus:
  - Cambios: el componente, las funciones auxiliares de `culinary-memory-draft.ts` (`MEMORY_CATEGORY_KEYS`, `memoryCategory`, `setCorrection`, `hideCategory`, `showCategory`, `applyCuisineRegister`), las claves i18n `memory_cat_*`, `memory_tag_*`, `memory_hidden`, `memory_show`, `memory_declare` y `memory_register_*`, y un test nuevo, `culinary-memory-categories.test.ts`. Se borra `memory_restore`.
  - RED: 14 fallan y 4 pasan, por la razón esperada.
  - GREEN: el móvil pasa 47 archivos y 459 tests; i18n, 41 tests; typecheck 0; `expo export` de Android da «android bundles (1)».
  - Verificación puntual del supervisor: los 3 archivos de memoria, 24/24; tsc sin errores.
  - Decisiones interpretadas: el título reutiliza `memory_learned`; «Declarar» crea una corrección vacía, y guardar queda bloqueado hasta que haya texto; si una categoría está a la vez corregida y oculta, se muestra como Declarado; los botones accesibles se etiquetan «acción: categoría».
- Fusionados en `main` (12-10-2026): #34 (prompt), #35 y #36 (prueba, `718d3d0`). M2 queda desbloqueada.

## Siguiente paso
- M2: casos gemelos en la prueba.
