# Contraste del asistente — chip de idea anclada y «Guardar como receta»

- **Rama:** `claude/vigilant-pascal-76h6xn` (sale de `main` c646c86)
- **Origen:** contraste medido el 08-10-2026; Andy aprobó el arreglo (el vídeo de demostración lo muestra).

## Objetivo
Que el chip de idea anclada y el botón «Guardar como receta» del asistente se lean bien, también en cocina.

## Problema
- Chip de idea anclada: fondo `tealSoft` (#2a4a4a) con rótulo `teal` (1,27:1) y texto `ink` (1,57:1). Casi invisible.
- «Guardar como receta»: fondo `terracotaSoft` (#d99a6e) con texto e icono `terracota` (1,37:1).

## Decisiones (aprobadas por Andy)
- Chip: fondo `paperWarm` con filete (0,5, `edge`); rótulo e icono siguen en `teal` y el texto en `ink` (10,55:1 y 13,03:1).
- Botón: fondo `terracota` con texto e icono en `paper`, como los botones principales (3,04:1).
- Añadido al implementar: el spinner que sustituye al icono mientras se estructura la receta también va en `paper`. En `terracota` sobre `terracota` (1:1) quedaba invisible.

## Alcance autorizado
Solo `apps/mobile/app/(tabs)/asistente.tsx` (estilos y color de iconos) y su test. Fuera de alcance: otras pantallas, los tokens del tema y los archivos de i18n (otra sesión edita `packages/i18n/src/es.ts`).

## Restricciones
- TDD estricto (fuente `~/.claude/CLAUDE.md`), runner `vitest run`.
- Commits sin Co-Authored-By.

## Tareas
- [x] C1 — contraste del chip y del botón de guardar (`512181b`)

## Criterios de aceptación
- Rótulo y texto del chip ≥ 4,5:1 sobre su fondo; icono ≥ 3:1.
- Texto, icono y spinner del botón ≥ 3:1 sobre su fondo.

## Comprobaciones
- `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test`
- `npx expo export --platform android` (salida fuera del repo)

## Progreso y evidencia
- No había tests de estilos ni snapshots de la pantalla, ni un helper de contraste exportado (`contrastRatio` de `src/lib/style-preview.ts` es privado). El test que ya renderiza la pantalla (`src/__tests__/chat-navigation.test.ts`) simula `StyleSheet.create` como identidad, así que los estilos llegan como objetos: el test nuevo mide el contraste WCAG de lo renderizado.
- Antes del cambio: móvil 186/186; typecheck OK.
- RED: 2 tests, por contraste (1,27 en el rótulo del chip; 1,37 en el texto del botón).
- Con la especificación literal, el spinner daba 1:1; se cambió a `paper`.
- GREEN: 15/15 en el archivo; móvil 188/188; typecheck OK; `expo export --platform android` OK.
- `graphify update .` no se corrió: `graphify-out/` está ignorado por git y la herramienta no está en la sesión en la nube.

## Pendiente
Con 3,04:1, el botón cumple el mínimo WCAG para iconos y texto grande, pero su texto (11 px) pediría 4,5:1. Pasa lo mismo en todos los botones principales de la app (papel sobre terracota): es una decisión de paleta, fuera de este arreglo.

## Siguiente paso
Revisión RDD de la rama, PR y fusión. El cambio llega a los teléfonos con el próximo binario móvil.
