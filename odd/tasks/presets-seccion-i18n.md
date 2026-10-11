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
- Una sola lista: `SectionPresetSheet.tsx` exporta `SECTION_PRESETS` y `AddToMenuSheet.tsx` la reutiliza. Tener dos copias del mismo literal hizo que una quedara en italiano.
- `AddToMenuSheet` creaba la sección y después la buscaba por nombre. Si el menú ya tenía otra con ese nombre, el plato iba a la vieja y la nueva quedaba vacía. Con los presets traducidos el choque es más probable, porque un chef en español pudo haber escrito «Postres» a mano. Ahora toma la sección que no estaba antes y tiene ese nombre.

## Alcance autorizado
Solo `SectionPresetSheet.tsx`, las claves nuevas de los tres diccionarios y su test. Fuera de alcance: otras pantallas y `section_name_placeholder` («Antipasti, Primi, Secondi…» en los tres idiomas, compartido con otras pantallas). Ampliación del 11-10-2026 (Andy: «termina las tareas pendientes»): `AddToMenuSheet.tsx`, cuyo paso «crear sección» (desde la ficha de receta) tenía una copia idéntica de los presets en italiano, y su test.

## Restricciones
- TDD estricto (fuente: `~/.claude/CLAUDE.md` y el pedido de Andy). Runner: `vitest run` (`pnpm -C apps/mobile test`).
- Conventional Commits sin atribución de IA.
- Entrega: `ask-on-risk` (por defecto). La previsión era de unas 235 líneas para P1 y unas 120 para P2, pero la rama llegó a 502 contra `main`. El 11-10-2026 Andy eligió dos PR apilados a `main`:
  - PR 1: `fix/presets-seccion-i18n`, con `ce2dc92`, `81bc128` y `6ede5d4` (235 líneas).
  - PR 2: `fix/presets-seccion-i18n-2`, con `70afa99` y este registro (unas 280 líneas), apilado sobre el PR 1.

## Tareas
- [x] P1 — presets de sección desde i18n (`ce2dc92`). Ruta: delegada, un escritor (Sonnet). Disparador: dos archivos no triviales (el test y el componente).
- [x] P2 — presets de `AddToMenuSheet` desde las mismas claves (`70afa99`). Ruta: delegada, el mismo escritor. Disparador: dos archivos no triviales (el test y el componente).

## Criterios de aceptación
- Con la app en español, la hoja muestra, en este orden: Entradas frías, Entradas calientes, Primeros platos, Principales de mar, Principales de tierra, Guarniciones, Prepostre, Postres, Petits fours. En inglés y en italiano, las listas de las decisiones, en el mismo orden.
- Tocar un preset llama a `onPick` con el nombre traducido y cierra la hoja.
- El nombre personalizado sigue funcionando como hoy.
- En el paso «crear sección» de `AddToMenuSheet`, los presets salen en el idioma de la app y en el mismo orden. Tocar uno crea la sección con el nombre traducido y agrega el plato a esa sección.

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
- RDD sobre `ce2dc92` (base `cabc15d`): riesgo medio (`executable_change` en el test), `review_due: false` por `under_budget` (231 líneas). Al cerrar, el preflight pidió consentimiento y Andy lo concedió: la revisión `review-d2fb0e1286527c4a` (lente `review-reliability`, sobre `81bc128`) se aprobó sin hallazgos y quedó acusada.
- P2, test nuevo: `apps/mobile/src/__tests__/add-to-menu-sheet-presets.test.ts`. Llega al paso «crear sección» como un chef: elige el menú y toca «Agregar sección».
- P2 RED, observado por el supervisor: fallan 4 de 5 por la razón esperada. En `es` y en `en` llegan los rótulos italianos y el toque crea «Primi piatti». Con una sección «Postres» previa, el plato va a `section-old`. El caso `it` pasa (caracterización).
- P2 GREEN, repetido por el supervisor: tests de las dos hojas 9/9; móvil 39 archivos y 397 tests; i18n 11 tests; typecheck de móvil e i18n con salida 0. `expo export` de Android: «android bundles (1)».
- RDD sobre `70afa99` (base `6ede5d4`): riesgo medio (`executable_change` en el test), `review_due: false` por `under_budget` (277 líneas). La revisión final se registra en Engram (`odd/presets-seccion-i18n/tasks`) y en el PR, porque anotarla aquí crearía otro candidato.
- Fuera de alcance, encontrado en P2: tras crear con éxito, `creating` nunca vuelve a `false` (solo se resetea en el `catch`). Al reabrir la hoja en la misma ficha, los chips quedan deshabilitados. Queda como tarea aparte.

## Siguiente paso
- PR 1 y PR 2 (apilado) a `main`; Andy dijo «ok» el 11-10-2026. La fusión es decisión de Andy. Cuando se fusione el PR 1, el PR 2 se redirige a `main` y se cierra y reabre para que corra la CI, que solo corre en PR contra `main`.
- graphify: el grafo no está versionado y vive solo en la carpeta principal, que hoy está en otra rama. Se actualiza allí con `graphify update .` después de fusionar.
