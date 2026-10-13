# Formato estándar de ingredientes — una sola regla para todas las entradas

- **Rama:** `feat/formato-estandar-ingredientes` (sale de `main` 92c0241)
- **Espejo Engram:** `odd/formato-estandar-ingredientes/tasks`
- **Origen:**
  - Diagnóstico del 13-10-2026 (Engram `atelier/formato-ingredientes-diagnostico-2026-10`).
  - Decisión de Andy: «reescribila al formato estándar» (los PDF y las fotos se reescriben, no se copian).

## Objetivo
Toda receta queda en el mismo formato estándar, entre por donde entre: chat del asistente, «Guardar como receta», PDF/DOCX/foto, Google Doc o alta manual. Así el banco de productos y el motor de costes reconocen los ingredientes.

## Problema
Hoy hay tres prompts distintos y ninguna regla común:
- El chat solo pide «cantidad primero».
- La extracción de GLM aplana las secciones dentro del nombre: «40 g AOVE (aceite de chorizo)».
- El prompt de PDF copia literalmente.
- La alta manual muestra el nombre primero.

El parser convierte «20 cl» o «1 cucharada» en unidades, y las notas contaminan el emparejamiento (AOVE emparejado con Chorizo) y los nombres de los borradores.

## Diseño (agente de diseño Opus, 13-10-2026)
- **Forma canónica:** `{ section, qty, unit ∈ g|kg|ml|l|unidad|null, name, note, pieceWeightG }`.
  - `name` es el producto tal como se compra, en singular.
  - Lo que cambia la compra va en el nombre (limpio, entero, en lomos); lo que hace la cocina va en la nota (picado, muy frío, alternativas).
- **`rawText` canónico:**
  - con medida: `400 g rape limpio`;
  - por piezas: `4 ud calamar`, con 350 en `pesoCalculoG`;
  - sin medida: `aceite`, con «1 cucharada» en la nota.
- **Línea de pantalla:** `displayLine = rawText + ", " + note`. Va en `contentJson.ingredients`, que es lo que leen las apps ya publicadas.
- **Invariante:** `parseIngredient(rawText)` devuelve exactamente `{qty, unit, name}`.
- **Columnas nuevas** en `RecipeIngredient`, nullable y aditivas: `section` y `note`. El esquema de `contentJson` no cambia.
- **Módulo compartido** `packages/shared/src/ingredient-standard.ts`:
  - unidades;
  - esquema;
  - `formatIngredientLine` y `displayLine`;
  - normalizador determinista: viñetas, negrita, backticks, fracciones, cl/dl a ml, cucharadas a nota, separación de notas, peso por pieza y secciones;
  - `INGREDIENT_RULES`, que se inyecta en los tres prompts.
- **Un solo pipeline** después de la extracción (`apps/api/lib/recipes/extraction-pipeline.ts`). Reemplaza los tres bucles duplicados de extract, upload y gdoc.
- **El servidor es el único que canoniza:** al guardar, cada `rawText` pasa por el normalizador.
  - Las secciones y notas se heredan por posición y nombre, para no perderlas con las apps viejas.
  - `findMatch` y los borradores usan solo el nombre limpio.
- **App:** la lista de ingredientes se agrupa por sección, con la nota y «350 g por pieza» debajo de cada línea.
  - En el editor la sección solo se lee; un ingrediente nuevo hereda la sección de la fila anterior.
  - Placeholder nuevo: «400 g rape limpio, muy frío».
- **Diferido:**
  - crear o mover secciones en el editor;
  - secciones en el método y en el PDF;
  - backfill de recetas viejas (Kokoo tiene 1, que se re-guarda a mano).

## Decisiones del padre (valores por defecto, sin pregunta)
- Para las piezas se usa `ud` en todos los idiomas (el parser ya lo reconoce como alias).
- En los rangos («2-3 dientes») se toma el máximo y «2-3» queda en la nota. Así el coste nunca se subestima.
- Las cucharadas no se convierten a gramos: quedan sin medida y el chef las completa.
- Estrategia de entrega: `single-pr`. Andy eligió PR único en la feature anterior; se repite.

## Alcance autorizado
F1–F5, F7 y la parte de código de F6.

Las corridas pagadas del banco de pruebas de F6 (unos 3–11 US$) se le consultan a Andy antes de gastar. F8 es una lista de pasos para Andy.

## Restricciones
- TDD estricto: activado (fuente `~/.claude/CLAUDE.md`), runner `vitest run` en cada paquete. RED observado antes de implementar.
- Migración aditiva, generada con `prisma migrate diff`. Producción la aplica el build de Vercel.
- Compatibilidad: las apps publicadas (Android 10 e iPhone 16) siguen viendo una lista plana y legible.
- Textos de la app en es/en/it; el español usa tuteo. Los artefactos técnicos van en inglés.
- Commits convencionales, sin Co-Authored-By.

## Tareas
| ID | Tarea | Ruta | Disparador |
|---|---|---|---|
| F1 | Parser: medidas caseras sin cantidad, cl/dl a ml, fracciones, escalado | Delegada W1 (Opus) | 2+ archivos no triviales |
| F2 | `ingredient-standard.ts` con normalizador y reglas | Delegada W1 | Ídem |
| F3 | Migración `section`/`note`, contrato y proyecciones, copias en duplicate/scale | Delegada W2 (Opus) | Ídem |
| F4 | Canonización al guardar, herencia, `contentJson` recalculado, comparación del PATCH, match con nombre limpio | Delegada W2 | Ídem |
| F5 | Prompts de extracción unificados, esquema por objetos, pipeline, las 3 rutas, banco de pruebas de extracción | Delegada W3 (Opus) | Ídem |
| F6 | Reglas en el prompt del chat y métrica `formato` en el banco de pruebas, más corridas pagadas con OK de Andy | Delegada W5 | Ídem |
| F7 | App: lista por secciones, editor, placeholder, i18n | Delegada W4 (Opus) | Ídem |
| F8 | Re-guardar el calamar de Kokoo y limpiar el banco | Andy (lista de pasos) | — |

Orden: F1 → F2 → F3 → F4 → F5 → F7 → F6.

- [x] F1 (`f41469b`)
- [x] F2 (`289bda0`)
- [x] F3 (`1b03dc6`, migración `20261013120000_recipe_ingredient_section_note`)
- [x] F4 (`c7d1721`)
- [x] F5 (`33681bb`)
- [ ] F6
- [x] F7 (`1b7b2f1`)
- [ ] F8

## Criterios de aceptación
- **F1:**
  - «20 cl ron» da 200 ml ron.
  - «1 cucharada aceite» da qty null y nombre «aceite».
  - «½ limón» da 0,5 unidad.
  - El escalado sigue correcto.
  - Las pruebas que ya existían pasan, salvo los dos cambios buscados en `parser.test.ts`.
- **F2:**
  - Ida y vuelta con `parseIngredient`.
  - Con las líneas de prod:
    - «40 g AOVE (aceite de chorizo)» da nombre AOVE y lo demás en nota (o en sección cuando viene como cabecera);
    - «4 calamares de 350 g aprox.» da `4 ud calamar` con 350.
  - Las cabeceras en negrita o «X:» se leen como secciones.
- **F3:** el detalle devuelve `section` y `note`, y duplicate y scale los copian.
- **F4:**
  - `rawText` canónico al crear y al editar.
  - Un PATCH desde una app vieja conserva la nota y la sección.
  - Un PATCH sin cambios no escribe nada.
  - Los borradores se crean con el nombre limpio y su categoría.
- **F5:**
  - La salida simulada de GLM, plana o por secciones, produce filas y emparejamientos correctos.
  - Las tres rutas usan el mismo pipeline.
  - El banco de pruebas de extracción con datos reales pasa.
- **F6:**
  - El prompt del chat recibe las reglas compartidas sin que quede ningún `{{`.
  - La métrica `formato` tiene pruebas.
  - Las corridas pagadas (con OK de Andy) dan `formato` ≥ base y no bajan los criterios.
- **F7:**
  - La lista se agrupa por sección y muestra la nota y el peso por pieza.
  - El editor conserva sección y nota.
  - El typecheck pasa.

## Comprobaciones
- `pnpm -C packages/shared exec tsc --noEmit`, `pnpm -C packages/shared test`
- `pnpm -C apps/api exec tsc --noEmit`, `pnpm -C apps/api test`
- `pnpm -C packages/i18n exec tsc --noEmit`, `pnpm -C packages/i18n test`
- `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test`

## Entrega
- Previsión: unas 2.400 líneas (más de 400). La estrategia es `single-pr`, por la preferencia de Andy en #47.
- RDD: activado. Cada commit se evalúa con `gentle-ai review assess`. Selección de los archivos sin seguimiento: `untracked_scope: exclude`.

## Progreso
- 13-10-2026: diseño hecho, documento creado, rama creada.
- W1 (F1 + F2, writer Opus):
  - RED: F1 tuvo 10 fallos esperados. F2 no tenía módulo; una segunda vuelta dio 2 fallos («4 panes», viñeta suelta).
  - GREEN: shared tsc y 410/410; api tsc y 1448 pruebas (`leave` cae por timeout y aislada pasa 8/8); mobile typecheck.
  - Comprobación del padre: `parser` + `ingredient-standard` 109/109.
  - Desvíos aceptados:
    - el escalado usa 3 decimales con coma;
    - los rangos se escalan en los dos extremos;
    - se quitan los números de lista «1. » (riesgo: «2. cebollas» pierde el 2);
    - en piezas el singular solo se aplica con qty > 1 (fallan «chiles» y «atunes»);
    - «2 latas de tomate» da 2 ud «lata de tomate»;
    - el esquema es un `ZodEffects`, así que F3 no puede usar `.extend`.
  - Nota para F7: `selectIngredientProduct` todavía no usa el formato canónico.

- W2 (F3 + F4, writer Opus):
  - RED:
    - F3: 7 fallos del contrato, más la proyección y las copias.
    - F4: 34 fallos esperados (match daba `probable` en vez de `exact`, borrador «chorizo», PATCH que solo cambia la nota sin escribir).
  - GREEN: shared 420/420; api tsc y 1486/1486 (sin flake); mobile typecheck.
  - Comprobación del padre:
    - las pruebas de `recipe-save` y de la ruta de match dan 19/19;
    - la migración es aditiva (2 columnas nullable).
  - Precedencia:
    - si el cliente manda qty/unit que contradicen la lectura, se respetan junto con su `rawText`;
    - la nota separada del texto gana; si no hay, va la del input y si no la heredada;
    - la sección del input gana; si no hay, va la del paréntesis que coincide con una sección conocida y si no la heredada;
    - `pesoCalculoG` usa el del cliente si no es null; si no, el peso por pieza de la línea.
  - Riesgos:
    - una línea vieja que una app vieja manda con qty/unit contradictorios queda como está hasta que alguien la edite;
    - un PATCH sobre una receta borrada con un `productId` inválido ahora da 400 en vez de 404.

- RDD F1–F4:
  - Riesgo medio, consentimiento `granted`, revisión aprobada y confirmada (linaje `review-5d15f574a858cbae`).
  - La revisión anterior de F1–F2 quedó desactualizada porque F3 y F4 se commitearon antes del START, y se rehízo con todo junto.
  - Avisos que se corrigen en F4b:
    - R3-plural-match-regression: `stripPluralEs` deja «tomates» en «tomat» y «huevos» en «huev», así que el nombre en singular ya no da exacto contra un producto en plural del banco.
    - R3-noop-patch-legacy-rewrite: un PATCH sin cambios reescribe las filas de una receta vieja que no está en formato canónico.
    - R3-scale-leading-zero-token (sugerencia): en «Harina 00, 200 g», el «00» se reformatea.

## Tareas añadidas
- [x] F4b (`7586fda`) — corregir los tres avisos de la revisión de F1–F4:
  - `stripPluralEs` con la regla española: vocal + s → quitar solo la s; consonante + es → quitar «es»;
  - el PATCH compara el `rawText` entrante sin canonizar contra el guardado, y si no hay cambios no escribe;
  - `scaleIngredientLine` solo escala el token inicial cuando la línea tiene la cantidad delante.
  - Ruta: delegada, después de W3.

- W4 (F7, writer Opus; misma rama, commit solo de sus archivos):
  - RED: mobile 10 fallos e i18n 2.
  - GREEN: i18n 93/93; mobile typecheck y 538/538.
  - El editor manda la línea completa (`rawText` + nota) con `note: null`. Al elegir un producto usa `formatIngredientLine` y conserva la nota.
- F4b (writer Opus en un worktree aislado; cherry-pick de c39b69d a `7586fda`):
  - RED: plurales «probable» en vez de «exact»; PATCH sin cambios que escribía; «0 harina».
  - GREEN: shared 421/421; api tsc y 1476 (`auth-flow` y `leave` por el timeout; aisladas 26/26).
  - Plural español: tomate y tomates comparten la clave «tomat».
  - `ingredientsUnchanged` acepta tanto el `rawText` guardado como la línea completa.
  - Quedó la carpeta `.claude/worktrees/agent-a92f6899512768cdd` (Windows no pudo borrarla por rutas largas); la rama ya se borró.

- W3 (F5, writer Opus):
  - RED: 6 archivos de prueba nuevos fallaban; el estándar tenía 18 fallos (sin builder, ítems como string, sin código tipado).
  - GREEN: api tsc y 1574/1574; `eval:extraccion` en modo A 1/1 (10 corridas); shared 421; mobile typecheck.
  - Comprobación del padre: `eval:extraccion` 1/1.
  - `pendingMatches` conserva su forma y el índice apunta a la fila de `recipeIngredients`.
  - El error `recipe_too_many_ingredients` va solo como mensaje, con el código genérico `recipe_extraction_failed`; un mensaje propio en la app queda como seguimiento.
  - Recupera secciones aplanadas con una heurística (60 % de las líneas con paréntesis, 2 o más etiquetas en bloques).
  - Modo B (`EVAL_LIVE=1`, 4 llamadas a GLM) no se corrió.
  - Huecos del normalizador que encontró: «q.b.», «al gusto» y «1 sobre»; «Ingredientes» sin dos puntos; plurales italianos -ane/-ova.

## Tareas añadidas (2)
- [ ] F2b — corregir los huecos del normalizador: «q.b.», «al gusto», «quanto basta», «a piacere» y «1 sobre» pasan a la nota sin cantidad; «Ingredientes/Ingredienti/Ingredients» sin dos puntos es una cabecera; plurales italianos -ane/-ova. Motivo: Kokoo está en Italia y «q.b.» es muy común.

## Siguiente paso
F2b, después la revisión RDD de F4b + F5 + F7 + F2b, y después F6 (con el OK de Andy para el gasto).
