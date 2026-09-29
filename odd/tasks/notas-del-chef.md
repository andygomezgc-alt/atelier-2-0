# Notas del chef — entrega 2 de la memoria culinaria

- **Rama:** `feat/notas-del-chef` (sale de `main` aeee756, con la entrega 1 ya en producción)
- **Espejo Engram:** `odd/notas-del-chef/tasks`
- **Origen:** decisiones del 29-09-2026 (Engram `atelier/decisiones-memoria-culinaria-2026-09`, puntos 5–7). Andy delegó el resto ("sigue tú con todo").

## Objetivo
Que lo que el chef dice en el chat pueda quedar fijo en la memoria cuando él lo decide, sin llamadas extra a la IA.

## Problema
La memoria solo aprende de recetas. Datos fijos que el chef dice en el chat ("no usamos cerdo", "horno de leña") se pierden, y la línea de identidad (1000 caracteres) no sirve como lista.

## Decisiones (tomadas por el padre con delegación de Andy)
- Tabla nueva `ChefNote` (id, restaurantId con borrado en cascada, text ≤160, createdAt). Máximo 10 por restaurante. Migración solo aditiva.
- API `GET/POST /api/restaurant/chef-notes` y `DELETE /api/restaurant/chef-notes/[id]`.
  - GET con `capture_idea`; POST y DELETE con `approve_recipe` (admin y chef ejecutivo).
  - Comprobación de origen igual que la memoria, y anti-IDOR por `restaurantId`.
- Con 10 notas, el POST devuelve 409 con el código nuevo `chef_notes_limit` (enum de shared, i18n, `CODE_TO_KEY` móvil y test de conteo).
- Prompt: las notas van dentro del bloque de identidad (cacheado), en orden de creación, precedidas de "Notas del chef:". Se inyectan aunque el aprendizaje esté apagado, igual que la identidad.
- "Borrar lo aprendido" no borra las notas. La página de privacidad las menciona.
- Móvil:
  - Al mantener apretado un mensaje del chat aparece "Recordar esto", solo con restaurante y con `approve_recipe`.
  - Se abre una hoja con el texto editable (máximo 160 caracteres) y se guarda.
  - La hoja de memoria lista las notas, con un botón para borrar cada una si se puede editar.
- Sin llamadas a la IA. Sin cola offline (requiere red, con un error legible).

## Alcance autorizado
N1–N3. Fuera de alcance: añadir notas desde la hoja de memoria, sugerencias automáticas del asistente y edición de notas.

## Restricciones
- TDD estricto: activado (fuente `~/.claude/CLAUDE.md`), runner `vitest run`.
- Migración: SQL generado con `prisma migrate diff` contra HEAD, sin tocar ninguna base remota. Producción la aplica el build de Vercel al fusionar.
- Textos en es/en/it.
- Commits sin Co-Authored-By.

## Tareas
| ID | Tarea | Ruta | Motivo |
|---|---|---|---|
| N1 | Tabla, migración, schemas shared, API, código de error, privacidad | Sonnet | Réplica de patrones existentes, varios archivos |
| N2 | Notas en el bloque de identidad del chat | Codex (gpt-5.6-sol, xhigh) | Fácil, 2 archivos |
| N3 | App: "Recordar esto" en el chat y lista en la hoja de memoria | Opus 5.5 | UI con varios componentes, teclado y permisos |

Orden: N1 → (N2 ‖ N3).

- [ ] N1 — tabla + API + error + privacidad
- [ ] N2 — notas en el prompt
- [ ] N3 — app móvil

## Criterios de aceptación
- N1: CRUD con permisos y anti-IDOR; texto recortado de 1 a 160 caracteres; el 11.º POST da 409 `chef_notes_limit`; DELETE de una nota ajena da 404; la migración solo crea la tabla.
- N2: con notas, el bloque de identidad (cacheado) incluye "Notas del chef:" y las notas en orden de creación; sin notas, no cambia nada.
- N3: al mantener apretado un mensaje (con restaurante y permiso) se abre "Recordar esto" con el texto prellenado y recortado a 160; guardar muestra la confirmación; el límite muestra el error traducido; la hoja de memoria lista y borra.

## Comprobaciones
- `pnpm -C apps/api exec tsc --noEmit`, `pnpm -C apps/api test`
- `pnpm -C packages/shared exec tsc --noEmit`, `pnpm -C packages/shared test`
- `pnpm -C packages/i18n exec tsc --noEmit`
- `pnpm -C apps/mobile exec tsc --noEmit`, `pnpm -C apps/mobile test`, `npx expo export --platform android` (borrar `dist`)

## Entrega
- Previsión: unas 560 líneas (con tests). Estrategia: `exception-ok`, un solo PR cohesionado (decisión delegada). Revisión RDD al cerrar cada tarea y sobre la rama completa.
- Después del merge: binario móvil con M3 (entrega 1) y N3 juntos.

## Progreso y evidencia
_(por tarea)_

## Siguiente paso
N1 (Sonnet).
