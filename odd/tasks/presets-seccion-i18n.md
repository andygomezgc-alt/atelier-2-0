# Presets de sección traducidos — hoja «Agregar sección» del menú

- **Rama:** `fix/presets-seccion-i18n` (sale de `main` cabc15d), worktree `.claude/worktrees/presets-seccion-i18n`
- **Origen:** encontrado el 11-10-2026 al planificar el vídeo de demostración en español (Engram `atelier/bug-presets-seccion-italiano`); Andy pidió el arreglo el mismo día.
- **Espejo en Engram:** `odd/presets-seccion-i18n/tasks`

## Objetivo
Que los nueve presets de la hoja «Agregar sección» salgan de i18n: cada chef los ve en el idioma de la app y, al tocar uno, la sección se crea con ese nombre.

## Problema
`apps/mobile/src/components/SectionPresetSheet.tsx:21-31` define los presets como literales en italiano («Antipasti freddi» … «Piccola pasticceria»). Un chef con la app en español o en inglés los ve en italiano y crea secciones con nombres en italiano.

## Por qué
El comentario de cabecera del componente daba por hecho que la app era solo para cocina italiana y que los presets no se traducían. La app ya se usa en español y en inglés, así que esa premisa dejó de valer.

## Decisiones
- Claves nuevas `section_preset_*` en `packages/i18n/src/{es,it,en}.ts`, junto a `section_name_placeholder`. El componente guarda las claves en el orden de hoy y traduce con `t()`.
- Italiano: los mismos literales de hoy.
- Español neutro. No hay ninguna decisión documentada sobre unificar vos y tú (es.ts mezcla ambos), y estos rótulos son sustantivos, así que el registro se juega en el vocabulario. Se evitan los términos solo peninsulares o solo rioplatenses:
  - «Entradas frías» y «Entradas calientes»: «entradas» se entiende en todos los países; «entrantes» es peninsular.
  - «Primeros platos», no «Pastas»: los *primi* también incluyen risottos, sopas y ñoquis, y «Pastas» es el rótulo rioplatense.
  - «Principales de mar» y «Principales de tierra»: «segundos» como sustantivo es peninsular; se conserva el par mar/tierra del italiano.
  - «Guarniciones» y «Postres»: comunes a todos los países.
  - «Prepostre», no «Pre-postre»: la RAE escribe los prefijos unidos a una base de una sola palabra (DPD, «prefijos»).
  - «Petits fours»: extranjerismo habitual en la alta cocina de todos los países, con el plural francés que la RAE recomienda para los extranjerismos sin adaptar. «Masas finas» es rioplatense y «Pastas» chocaría con la pasta.
- Inglés británico, como `dateLocale` (`en-GB`): «Cold starters», «Hot starters», «First courses», «Seafood mains», «Meat mains», «Sides», «Pre-dessert», «Desserts», «Petits fours».
- Las secciones ya guardadas no cambian: no hay migración y solo cambia el nombre de las secciones nuevas.

## Alcance autorizado
Solo `SectionPresetSheet.tsx`, las claves nuevas de los tres diccionarios y su test. Fuera de alcance: otras pantallas y `section_name_placeholder` («Antipasti, Primi, Secondi…» en los tres idiomas, compartido con otras pantallas). `AddToMenuSheet.tsx:51-61` tiene una copia idéntica de los presets en italiano y queda pendiente aparte.

## Restricciones
- TDD estricto (fuente: `~/.claude/CLAUDE.md` y el pedido de Andy). Runner: `vitest run` (`pnpm -C apps/mobile test`).
- Conventional Commits sin atribución de IA.
- Entrega: `ask-on-risk` (por defecto). Previsión de unas 120 líneas en un solo commit, por debajo del presupuesto de 400.

## Tareas
- [x] P1 — presets de sección desde i18n (`ce2dc92`). Ruta: delegada, un escritor (Sonnet). Disparador: dos archivos no triviales (el test y el componente).

## Criterios de aceptación
- Con la app en español, la hoja muestra, en este orden: Entradas frías, Entradas calientes, Primeros platos, Principales de mar, Principales de tierra, Guarniciones, Prepostre, Postres, Petits fours. En inglés y en italiano, las listas de las decisiones, en el mismo orden.
- Tocar un preset llama a `onPick` con el nombre traducido y cierra la hoja.
- El nombre personalizado sigue funcionando como hoy.

## Comprobaciones
- `pnpm -C apps/mobile test`, `pnpm -C apps/mobile typecheck`
- `pnpm -C packages/i18n test`, `pnpm -C packages/i18n typecheck`
- `npx expo export --platform android` (salida fuera del repo)

## Progreso y evidencia
- Línea base (cabc15d): móvil 37 archivos y 388 tests; i18n 11 tests; typecheck de móvil e i18n OK.
- Test nuevo: `apps/mobile/src/__tests__/section-preset-sheet.test.ts`. Usa el `useI18n` real con `setLang`, sin simularlo, para recorrer los diccionarios de verdad.
- RED, observado por el supervisor con la producción sin cambios: fallan 3 de 4 por la razón esperada. En `es` y en `en` llegan los rótulos italianos, y el toque llama a `onPick("Primi piatti")`. El caso `it` pasa: es de caracterización y protege a los usuarios en italiano.
- GREEN, repetido por el supervisor: test nuevo 4/4; móvil 38 archivos y 392 tests; i18n 11 tests; typecheck de móvil e i18n con salida 0. `expo export` de Android: «android bundles (1)».
- Datos: no hay migración. Las secciones ya guardadas conservan su nombre; solo las nuevas toman el nombre traducido.
- RDD sobre `ce2dc92` (base `cabc15d`): riesgo medio (`executable_change` en el test), `review_due: false` por `under_budget` (231 líneas). La revisión queda pendiente en el corte.

## Siguiente paso
Decisión de Andy: abrir PR a `main` y, si quiere, el arreglo aparte de `AddToMenuSheet.tsx`.
