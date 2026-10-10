# Memoria encendida — entrega 3 de la memoria culinaria

- **Rama:** `feat/memoria-encendida`, sale de `origin/claude/optimistic-euler-oq7mp1` (= `main` c646c86 + este plan)
- **Espejo Engram:** `odd/memoria-encendida/tasks`
- **Origen:** conversación con Andy del 10-10-2026 (Engram `atelier/decisiones-memoria-encendida-2026-10`). Plan escrito en una sesión en la nube; la ejecución pasa a una ventana local.

## Objetivo
Que el asistente de cada restaurante tenga contexto desde el primer día y se vaya personalizando solo, sin preguntas al empezar y gastando los mínimos tokens.

## Problema (comprobado en el código el 10-10-2026)
- La memoria viene apagada: `CulinaryMemory.enabled` es `false` por defecto y, sin fila, `chatMemory` devuelve `null`.
- Las recetas cargadas se guardan como `draft` (`saveNewRecipe`), y la memoria solo lee `in_test` y `approved`: cargar recetas al principio no le enseña nada.
- Aprende como mucho una vez por semana (`WEEK` en `worker.ts`). La primera vez, al encenderla o en el cron siguiente.
- El asistente no recibe el nombre de quien escribe (solo el del restaurante), ni la ubicación ni la fecha, aunque el principio 4 del prompt pide usarlas «cuando se proporcionen».
- La memoria solo ve las 20 recetas más recientes; las antiguas no cuentan.

## Decisiones de Andy (10-10-2026)
1. Sin preguntas al empezar. El nombre sale del perfil (`User.name`, el que se ve en Casa). El tipo de cocina no se pregunta: lo deduce la memoria de los productos y técnicas.
2. Ciudad o zona: campo opcional en «Nuestra cocina» y al crear el restaurante.
3. El asistente recibe el mes actual, para proponer producto de temporada.
4. Memoria encendida por defecto: en los restaurantes nuevos y en los que nunca guardaron una decisión. Los que la tienen apagada siguen igual.
5. Botón verde «Memoria» arriba en el chat; al tocarlo abre «Nuestra cocina», donde se apaga.
6. Recetas cargadas (PDF, Word, foto, Google Docs): **aprobadas si las carga un admin; en prueba si las carga el chef ejecutivo o el sous-chef** (opción 2). Motivo: una receta aprobada solo la puede editar el admin, también el precio de venta y los alérgenos, y el chef ejecutivo se atascaría. La memoria aprende de la receta al momento.
7. Los ingredientes más repetidos de todas las recetas en prueba y aprobadas entran en la memoria, contados sin IA.
8. Rutas: Opus 5.5 en esfuerzo alto para lo complejo, Codex con GPT-6.1 en esfuerzo alto para lo intermedio y Haiku 5.5 en esfuerzo alto para lo fácil.

## Alcance autorizado
Solo E1–E9. Fuera de alcance, para la siguiente entrega y después de probar con recetas reales de Kokoo: leer 50 recetas y guardar 7 tendencias, aprender a diario de los cambios que no son cargas, cargar varias recetas a la vez y que el asistente proponga «¿lo recuerdo?».

## Restricciones
- TDD estricto: modo ON, fuente `~/.claude/CLAUDE.md` («Strict TDD Mode: enabled»), runner `vitest run`. RED observado antes de implementar.
- Textos de interfaz en es/en/it.
- Conventional Commits en español, como el resto del repo, con un commit por tarea como mínimo.
- Migración aditiva: SQL generado con `prisma migrate diff` contra HEAD más las sentencias de datos escritas a mano. Nunca contra una base remota; producción la aplica el build de Vercel al fusionar.
- Caché: como máximo 4 marcadores por petición (3 en el sistema y 1 en el hilo). Lo que cambia por persona o por mes va después del último marcador del sistema.
- No fusionar con `main` ni desplegar sin la decisión de Andy.

## Tareas

| ID | Tarea | Ruta | Motivo de la ruta | Archivos |
|---|---|---|---|---|
| E1 | Cimientos: esquema, migración, contratos y textos | Codex (GPT-6.1, alto) | Intermedia: migración con datos de producción y contratos compartidos | `packages/db/prisma/schema.prisma`, migración nueva, `packages/shared/src/{api-contract,culinary-memory}.ts`, `packages/shared/src/recipe-import.ts` (nuevo) + tests y export en el índice, `packages/i18n/src/{es,en,it}.ts` |
| E2 | Nombre, ubicación y mes para el asistente | Haiku 5.5 (alto) | Fácil: formato de texto cerrado | `apps/api/lib/anthropic.ts`, `apps/api/lib/__tests__/anthropic.test.ts`, `apps/api/app/api/conversations/[id]/messages/route.ts` y su test |
| E3 | Ingredientes frecuentes en la memoria | Codex (GPT-6.1, alto) | Intermedia: lógica pura que entra en el contexto preparado y en el worker | `apps/api/lib/culinary-memory/{evidence,service,worker}.ts` + tests |
| E4 | Memoria encendida al crear el restaurante y ciudad en el servidor | Codex (GPT-6.1, alto) | Intermedia: transacciones de memoria y de restaurante | `apps/api/app/api/restaurant/route.ts`, `apps/api/app/api/restaurant/__tests__/create.test.ts` (nuevo), `apps/api/lib/culinary-memory/service.ts` + test |
| E5 | Cargadas aprobadas o en prueba, y aprendizaje al momento | Opus 5.5 (alto) | Compleja: segundo plano, bloqueo, concurrencia y Postgres real | `apps/api/lib/create-recipe.ts` + test, `apps/api/app/api/recipes/route.ts` + test nuevo, `apps/api/lib/culinary-memory/worker.ts` + test, `memory.integration.test.ts` |
| E6 | App: marcar las recetas cargadas | Codex (GPT-6.1, alto) | Intermedia: estado del formulario, autoguardado e idempotencia | `apps/mobile/app/recetas/{cargar,nueva}.tsx`, `apps/mobile/src/lib/{recipe-draft,recipe-autosave,recipe-editor}.ts` + tests |
| E7 | App: botón verde «Memoria» en el chat | Opus 5.5 (alto) | Compleja: pantalla principal (1.195 líneas), regla de hooks y accesibilidad | `apps/mobile/app/(tabs)/asistente.tsx`, `apps/mobile/src/components/MemoryChip.tsx` (nuevo), `apps/mobile/src/theme/index.ts`, test nuevo |
| E8 | App: ciudad en «Nuestra cocina» y al crear el restaurante | Haiku 5.5 (alto) | Fácil: dos campos opcionales y funciones puras | `apps/mobile/src/components/CulinaryMemorySheet.tsx`, `apps/mobile/app/(auth)/create-restaurant.tsx`, `apps/mobile/src/lib/culinary-memory-draft.ts`, `apps/mobile/src/lib/restaurant-create.ts` (nuevo) + tests |
| E9 | Privacidad y documentación | Haiku 5.5 (alto) | Fácil: textos | `apps/api/app/privacidad/page.tsx`, `docs/MEMORIA-ENCENDIDA-2026-10.md` (nuevo), `docs/ESTADO-ACTUAL.md`, este plan |

Olas (archivos disjuntos en paralelo): O1 = E1 · O2 = E2 ‖ E3 ‖ E6 ‖ E8 · O3 = E4 ‖ E5 ‖ E7 · O4 = E9 · cierre del padre.

E1 añade todos los textos nuevos de la entrega, para que E6, E7 y E8 no toquen los archivos de idioma a la vez. E3 va antes que E4 y E5 porque los tres tocan `service.ts` o `worker.ts`.

Codex: usar el id exacto de GPT-6.1 que acepte el CLI instalado (`--model <id> --effort high`); no inventarlo. Si sigue sin poder lanzar procesos con `--write` (`CreateProcessAsUserW failed: 5`), funciona como autor: recibe el código en el prompt y devuelve ediciones exactas, y un operador Haiku 5.5 en alto las aplica y corre RED/GREEN.

- [x] E1 — cimientos (`7744427`)
- [x] E2 — nombre, ubicación y mes (`bf64a66`)
- [x] E3 — ingredientes frecuentes (`66d3228`)
- [x] E4 — memoria al crear y ciudad en el servidor (`9372f6e`)
- [x] E5 — cargadas aprobadas/en prueba y aprendizaje al momento (`54495d4`; pendiente de adaptar tras asistente-arreglos)
- [x] E6 — app: recetas cargadas (`5d94a58`)
- [x] E7 — app: botón «Memoria» (`2b14c87`; pendiente de adaptar tras asistente-arreglos)
- [x] E8 — app: ciudad (`03d398b`)
- [x] E9 — privacidad y documentación (ver evidencia)

## Especificación por tarea

### E1 — Cimientos
- `schema.prisma`: `Restaurant.city String? @db.VarChar(80)` y `CulinaryMemory.enabled Boolean @default(true)`.
- Migración `20261010120000_memoria_encendida/migration.sql`, en este orden:
  ```sql
  ALTER TABLE "Restaurant" ADD COLUMN "city" VARCHAR(80);
  ALTER TABLE "CulinaryMemory" ALTER COLUMN "enabled" SET DEFAULT true;
  -- Restaurantes que nunca guardaron una decisión: memoria encendida (decisión del 10-10-2026).
  INSERT INTO "CulinaryMemory" ("restaurantId", "enabled")
  SELECT r."id", true FROM "Restaurant" r
  WHERE NOT EXISTS (SELECT 1 FROM "CulinaryMemory" m WHERE m."restaurantId" = r."id");
  -- El contexto preparado se rehace en el siguiente mensaje, ya con los ingredientes frecuentes (E3).
  UPDATE "CulinaryMemory" SET "preparedContext" = NULL, "preparedRevision" = -1, "preparedVersion" = -1;
  ```
  Las filas existentes con `enabled = false` no se tocan. `CulinaryMemory` no tiene triggers, así que el `UPDATE` no tiene efectos secundarios.
- Contratos compartidos:
  - `CreateRestaurantRequestSchema`: `city: z.string().trim().max(80).optional()`.
  - `PatchCulinaryMemorySchema`: `city: z.string().trim().max(80).nullable().optional()`. `CulinaryMemoryResponse` gana `city: string | null`.
  - `CreateRecipeRequestSchema`: `origin: z.literal("import").optional()`.
  - `recipe-import.ts` (nuevo): `importedRecipeState(role: Role): "approved" | "in_test"`, que devuelve `"approved"` solo para `admin`. Comentar el motivo (decisión 6). Exportarlo desde el índice. Lo usan el servidor (E5) y la app (E6), así la regla vive en un solo sitio.
- Textos nuevos (es / it / en):

  | Clave | es | it | en |
  |---|---|---|---|
  | `chat_memory` | Memoria | Memoria | Memory |
  | `chat_memory_off` | Memoria apagada | Memoria spenta | Memory off |
  | `chat_memory_hint` | Abre Nuestra cocina para ver o apagar la memoria. | Apre La nostra cucina per vedere o spegnere la memoria. | Opens Our kitchen to see or turn off the memory. |
  | `memory_city` | Ciudad o zona (opcional) | Città o zona (facoltativo) | City or area (optional) |
  | `memory_city_hint` | Ej.: Ancona, Marche | Es.: Ancona, Marche | E.g. Ancona, Marche |
  | `onboard_create_city_label` | Ciudad o zona (opcional) | Città o zona (facoltativo) | City or area (optional) |
  | `onboard_create_city_placeholder` | Ej.: Ancona, Marche | Es.: Ancona, Marche | E.g. Ancona, Marche |
  | `recipe_import_approved` | Al guardarla queda aprobada y la memoria aprende de ella. | Una volta salvata, la ricetta resta approvata e la memoria impara da essa. | Once saved, it is approved and the memory learns from it. |
  | `recipe_import_in_test` | Al guardarla queda en prueba y la memoria aprende de ella. | Una volta salvata, la ricetta resta in prova e la memoria impara da essa. | Once saved, it stays in testing and the memory learns from it. |

  `memory_note` cambia (ya no es solo semanal):
  - es: «Aprende de las recetas en prueba y aprobadas: al momento cuando cargas una y una vez por semana con los demás cambios. Tu petición en el chat siempre tiene prioridad.»
  - it: «Impara dalle ricette in prova e approvate: subito quando ne carichi una e una volta a settimana con le altre modifiche. La tua richiesta in chat ha sempre la precedenza.»
  - en: «Learns from recipes in testing and approved recipes: right away when you upload one, and once a week from other changes. Your current chat request always takes priority.»
- Tests: `city` (recorte, máximo 80, `null` en el PATCH), `origin` (rechaza otros valores), `importedRecipeState` por rol, paridad de claves entre idiomas.
- Migración comprobada en un Postgres desechable local:
  1. aplicar las migraciones anteriores;
  2. sembrar un restaurante sin memoria y otro con `enabled = false`;
  3. aplicar la nueva y comprobar que el primero queda encendido y el segundo sigue apagado;
  4. `prisma migrate diff --from-migrations ... --to-schema-datamodel ... --shadow-database-url <local>` sale vacío.

### E2 — Nombre, ubicación y mes para el asistente
- `buildSystemBlocks(restaurant, recentRecipes, pinnedIdea, culinaryMemory?, conversation?: { speakerName?: string | null; now?: Date })`. `restaurant` acepta `city?: string | null`.
- Bloque de identidad (cacheado): con ciudad (recortada y no vacía), una línea `Ubicación: <ciudad>` justo después de `# Restaurante: <nombre>`. Sin ciudad, el texto queda idéntico al de hoy, y los tests actuales siguen pasando sin cambios.
- Bloque dinámico (sin marcador, después de las recetas recientes y de la idea anclada), ahora siempre presente. Si hay recetas o idea, va precedido de una línea en blanco, como `# Idea anclada`:
  ```
  # Conversación
  - Quien escribe: <nombre>
  - Mes actual: octubre de 2026
  ```
  - La línea «Quien escribe» solo aparece si hay nombre.
  - El mes sale de una lista fija en español (`enero` … `diciembre`): mes UTC de `now` (por defecto `new Date()`), con el formato `<mes> de <año>`. Sin `Intl`, para que el texto no varíe entre entornos.
  - El nombre y el mes no van en el bloque de identidad, porque cambiarían el prefijo cacheado que comparte todo el equipo.
- Marcadores: siguen siendo como máximo 3 en el sistema y 1 en el hilo.
- Ruta de mensajes:
  - obtiene el nombre con `prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } })`, dentro del `Promise.all` en la rama normal y por separado en la vista previa;
  - añade `city` al `select` del restaurante;
  - pasa `{ speakerName }` a `buildSystemBlocks`.
- Tests:
  - identidad con y sin ciudad;
  - bloque dinámico con nombre y mes para fechas fijas (`2026-10-10` → `octubre de 2026`; `2026-01-01T00:30:00Z` → `enero de 2026`);
  - sin nombre no hay línea «Quien escribe»;
  - el número de marcadores no cambia;
  - la ruta pasa el nombre y la ciudad (mock de `db.user.findUnique`).
- Coste: unos 25 tokens más por mensaje, dentro del prefijo que se cachea con el hilo.

### E3 — Ingredientes frecuentes
- `evidence.ts`: `frequentIngredients(evidence: Evidence[], { min = 2, max = 10 } = {}): { name: string; recipes: number }[]`.
  - Cuenta en cuántas elaboraciones distintas (`duplicateKey`) aparece cada nombre normalizado de `Evidence.ingredients`. Una receta cuenta una sola vez por ingrediente.
  - Excluye los básicos: nombres iguales a `sal, sale, salt, pimienta, pepe, pepper, agua, acqua, water, aceite, olio, oil, aove, evo`, o que empiecen por uno de ellos seguido de un espacio («sal fina», «olio evo»). «salsa», «peperoncino» o «pepino» no se excluyen.
  - Recorta los nombres a 40 caracteres y se queda con los que aparecen en al menos `min` recetas.
  - Ordena por número de recetas (de más a menos) y luego por nombre, con comparación simple de cadenas (no `localeCompare`), y devuelve como máximo `max`.
- `memoryContext(corrections, facts, excluded, frequent = [])`:
  - Si `frequent` no está vacío y la categoría `"ingredients"` no está excluida:
    - añade al JSON `"ingredientesFrecuentes": "ricciola 8, azafrán 6"`;
    - añade a la cabecera la frase «ingredientesFrecuentes dice en cuántas recetas en prueba o aprobadas aparece cada ingrediente.».
  - Devuelve `""` solo si no hay correcciones, ni tendencias, ni ingredientes. Sin ingredientes, el texto queda idéntico al de hoy.
- `service.ts`: `loadIngredientStats(restaurantId)`.
  - Lee hasta 300 recetas `approved`/`in_test` no borradas (`orderBy: updatedAt desc, id asc`, `select: evidenceSelect`).
  - Les aplica `recipeEvidence`, quita los duplicados por `duplicateKey` y llama a `frequentIngredients`.
  - `chatMemory` la usa cuando reconstruye el contexto.
- `worker.ts`: al publicar, `preparedContext = memoryContext(corrections, learned, excludedKeys, await loadIngredientStats(restaurantId))`. Se calcula después de volver a leer las fuentes y antes de la transacción.
- Invalidación: no hace falta nada más, porque los triggers ya suben `dirtyRevision` con cualquier cambio culinario en una receta elegible.
- Tests:
  - la función pura: básicos, duplicados, umbral, orden, recorte y `max`;
  - la cabecera y el JSON, con y sin ingredientes;
  - la exclusión de `ingredients`;
  - la reconstrucción en `chatMemory`;
  - la publicación del worker.
- Coste: como mucho unos 80 tokens, dentro del bloque de memoria cacheado.

### E4 — Memoria encendida al crear el restaurante y ciudad en el servidor
- `POST /api/restaurant`:
  - guarda `city` (vacía → `null`);
  - crea la memoria en la misma transacción (`culinaryMemory: { create: {} }`), que nace encendida gracias al nuevo valor por defecto de E1.
- `getCulinaryMemory` devuelve `city`. `patchCulinaryMemory` guarda `city` en el restaurante dentro de la misma transacción, igual que `identityLine` (vacía → `null`). Un PATCH sin `city` no la toca.
- Las filas que crea el `upsert` de `patchCulinaryMemory` ahora nacen encendidas. Para ellas `turnedOn` queda en `false` y el cron las recoge (`nextCheckAt` = ahora). Un test debe fijar este comportamiento.
- Tests: crear un restaurante con y sin ciudad crea su memoria encendida; GET y PATCH con ciudad; un PATCH sin `city` la conserva.

### E5 — Cargadas aprobadas o en prueba, y aprendizaje al momento
- `saveNewRecipe(restaurantId, userId, body, role)`:
  - con `origin: "import"`, `state = importedRecipeState(role)`; si queda `approved`, también `approvedById = userId` y `approvedAt = now`;
  - sin `origin`, `draft` como hoy;
  - la huella de idempotencia ya incluye `origin`.
- `POST /api/recipes`:
  - `export const maxDuration = 90`.
  - Lanza el aprendizaje con `after()` solo si se cumplen cuatro condiciones:
    1. la receta es nueva (no `reused`);
    2. viene de una carga;
    3. su estado es `approved` o `in_test`;
    4. `memoryProviderConfig()` existe.
  - El aprendizaje es `learnAfterImport(restaurantId, …)` con `AbortSignal.timeout(MINIMUM_ROW_TIME_MS)`.
  - Registra el resultado (`culinary_memory_import_run`) y los fallos (`culinary_memory_import_run_failed`) con `logger`, igual que `learnNow` en la ruta de la memoria. La respuesta no espera al aprendizaje.
- `processMemory(…, options?: { afterImport?: boolean })`, en modo importación:
  - salta la espera del reintento y la ventana semanal; para reservar solo exige que no haya un bloqueo vigente, sin condiciones sobre `retryAt`, `cycleStartedAt` ni `lastAttemptAt`;
  - cuenta como intento normal: `retryDue = false`, `isRetry = false`, `cycleStartedAt = lastAttemptAt = now` y `nextCheckAt = now + WEEK`;
  - con un bloqueo vigente devuelve `"locked"` (fuera de este modo sigue devolviendo `"skipped"`);
  - todo lo demás no cambia: memoria apagada, sin novedades, menos de 2 recetas, misma huella, categorías excluidas, presupuesto, validación y relectura final.
- `learnAfterImport(restaurantId, { generator, config, signal, pollMs = 3000 })`:
  - repite `processMemory(…, { afterImport: true })` mientras devuelva `"locked"` o `"busy"`, esperando `pollMs` entre intentos; la señal corta la espera;
  - caso real: dos recetas cargadas casi a la vez. La primera corrida falla porque sus fuentes cambiaron, y la segunda, que esperaba el bloqueo, aprende con las dos.
- Tests unitarios:
  - estado por rol: admin → `approved` con aprobador y fecha; chef ejecutivo y sous-chef → `in_test`; sin origen → `draft`;
  - la ruta solo lanza el aprendizaje cuando toca: no con `reused`, no en borrador, no sin proveedor;
  - el modo importación salta la semana y el reintento, y devuelve `"locked"` con bloqueo;
  - `learnAfterImport` reintenta con `locked`/`busy`, para con cualquier otro resultado y respeta la señal.
- Integración (Postgres real, `CULINARY_MEMORY_IT=1`):
  - con la memoria ya aprendida esta semana, una carga vuelve a aprender al momento;
  - dos cargas solapadas acaban publicando con las dos recetas (un generador lento retiene el bloqueo);
  - con la memoria apagada no se llama al proveedor;
  - después de una carga, una corrida normal del cron sigue respetando la semana.

### E6 — App: marcar las recetas cargadas
- `cargar.tsx`: `setRecipeDraft({ …, origin: "import" })`, tanto para archivo o foto como para Google Docs.
- `nueva.tsx`:
  - estado `origin` (`"import" | null`), tomado del borrador entrante solo si no trae `editId`;
  - entra en `formFingerprint`, en `editorSnapshot` y en la petición de creación (`...(origin ? { origin } : {})`), y nunca en la edición (`patchRecipe`);
  - al recuperar un autoguardado, se restaura.
- `recipe-autosave.ts`: `RecipeEditorDraft.origin?: "import" | null`. `loadRecipeDraft` acepta `undefined`, `null` o `"import"` y rechaza cualquier otro valor; los borradores antiguos siguen cargando.
- Bajo el botón Guardar, si `origin === "import"` y no es una edición: `t(importedRecipeState(role) === "approved" ? "recipe_import_approved" : "recipe_import_in_test")`.
- Tests:
  - autoguardado con origen: ida y vuelta, valor inválido rechazado, borrador antiguo sin el campo;
  - la petición de creación lleva `origin` y la de edición no. Para probarlo, extraer a una función pura en `src/lib/recipe-editor.ts`.

### E7 — App: botón verde «Memoria»
- Tema: `colors.green = "#3f6b4a"` (contraste 5,7:1 sobre `paper`).
- `MemoryChip({ enabled, onPress })`: pastilla con las medidas de «Historial» (alto mínimo 48, radio `pill`, borde 0,5).
  - Encendida: punto de 8 px, borde y texto en `colors.green`, texto `t("chat_memory")`.
  - Apagada: punto y texto en `colors.mute`, borde `colors.edge`, texto `t("chat_memory_off")`.
  - `accessibilityRole="button"`, `accessibilityLabel` igual al texto visible y `accessibilityHint = t("chat_memory_hint")`.
- `asistente.tsx`:
  - con un restaurante real, pide `getCulinaryMemory()` al montar, al cambiar de restaurante y al cerrar la hoja;
  - estado `memoryEnabled: boolean | null`: con `null` (cargando o con error) el botón no se pinta;
  - el botón va en la fila `chatActions`, después de «Historial», y abre `CulinaryMemorySheet` con el `restaurantId`;
  - sin restaurante (vista previa) no hay botón;
  - todos los hooks nuevos van antes de cualquier `return`; lo vigila `hooks-order.test.ts`.
- El sous-chef también ve el botón; la hoja ya le deja solo consultar (`canEdit`).
- Tests:
  - componente con `react-test-renderer`, como `remember-note.test.ts`: textos, colores, accesibilidad y `onPress`;
  - `hooks-order` y el resto de pruebas de la app en verde.

### E8 — App: ciudad
- `culinary-memory-draft.ts`: `memoryPatchBody(data, draft)` construye el cuerpo del PATCH, que hoy se arma dentro de `save()`, y ahora incluye `city`. La hoja lo usa.
- `CulinaryMemorySheet.tsx`: campo `t("memory_city")` después de la descripción:
  - `placeholder` `t("memory_city_hint")`, una línea, `maxLength` 80;
  - editable con `canEdit` y sin `busy`.
- `src/lib/restaurant-create.ts`: `createRestaurantBody({ name, identityLine, city })` recorta los textos y omite los vacíos. `create-restaurant.tsx` añade el campo opcional (`onboard_create_city_label` / `onboard_create_city_placeholder`, `maxLength` 80) y usa esa función.
- Tests de las dos funciones puras.

### E9 — Privacidad y documentación
- `privacidad/page.tsx`, con el mismo registro de la página (voseo), debe explicar:
  - la memoria viene activada y se apaga en Perfil → Nuestra cocina o desde el botón «Memoria» del chat;
  - aprende al cargar una receta y cada semana, y cuenta los ingredientes más repetidos sin IA;
  - el asistente recibe el nombre de perfil de quien escribe, la ciudad o zona si se indica, y el mes actual.
- `docs/MEMORIA-ENCENDIDA-2026-10.md`: qué cambió, para quién, cuánto cuesta y cómo volver atrás (apagar la memoria por restaurante o revertir el commit).
- `docs/ESTADO-ACTUAL.md` y este plan, con la evidencia.

## Criterios de aceptación
- E1: migración probada en local con un restaurante sin memoria (queda encendido) y otro con la memoria apagada (sigue apagado); contratos y textos en es/en/it con paridad de claves.
- E2: el bloque de identidad solo cambia si hay ciudad; nombre y mes van en el bloque dinámico; el número de marcadores no cambia.
- E3: como mucho 10 ingredientes, en al menos 2 recetas, sin básicos y en orden estable; sin ingredientes, el texto de la memoria queda idéntico; respeta la exclusión de `ingredients`.
- E4: todo restaurante nuevo nace con su memoria encendida; la ciudad se guarda y se devuelve.
- E5: las cargas de un admin quedan aprobadas y las del resto en prueba; la memoria aprende en segundo plano sin esperar a la semana, también con dos cargas solapadas; la cadencia semanal del cron no cambia.
- E6: solo las recetas cargadas viajan con `origin`, también tras recuperar un autoguardado; la edición nunca lo envía.
- E7: botón verde con la memoria encendida, gris con la memoria apagada y oculto sin restaurante; abre «Nuestra cocina»; objetivo táctil de 48 o más.
- E8: la ciudad se edita en «Nuestra cocina» y se puede poner al crear el restaurante; es opcional.
- E9: la privacidad describe lo que se envía y cómo apagar la memoria.

## Comprobaciones por tarea
- `pnpm -C apps/api exec tsc --noEmit` y `pnpm -C apps/api test`
- `pnpm -C packages/shared exec tsc --noEmit` y `pnpm -C packages/shared test` (si se toca shared)
- `pnpm -C packages/i18n exec tsc --noEmit` y `pnpm -C packages/i18n test` (si se toca i18n)
- `pnpm -C apps/mobile exec tsc --noEmit` (ignorar el TS5101 preexistente) y `pnpm -C apps/mobile test` (si se toca la app)
- E1 y E5: integración de memoria contra un Postgres desechable local: `CULINARY_MEMORY_IT=1 pnpm --filter api exec vitest run lib/culinary-memory/memory.integration.test.ts`.
- Al cierre: `npx expo export --platform android` en `apps/mobile` (borrar `dist` después).

## Entrega
- Previsión: unas 1.300 líneas con tests (más de la mitad, tests). Un PR cohesionado cuando Andy lo decida. Revisión RDD al cerrar cada tarea y sobre la rama completa.
- Publicación: primero el servidor (fusión con `main`; Vercel aplica la migración) y después los binarios Android e iPhone, porque E6, E7 y E8 los necesitan.
- Tras desplegar: el cron de las 05:00 UTC hará el primer aprendizaje en los restaurantes que se acaban de encender y tienen al menos 2 recetas en prueba o aprobadas. Es una llamada a GLM por restaurante, de menos de 1 céntimo.
- Las apps antiguas siguen funcionando con el servidor nuevo, con tres diferencias:
  - guardan las recetas cargadas como borrador, porque no envían `origin`;
  - no ven el botón «Memoria»;
  - no ven el campo de ciudad.

## Estado al escribir el plan (10-10-2026, sesión en la nube)
- No se cambió código: solo se añadió este plan.
- Línea base en esa sesión: API con `tsc` correcto y 794/794 pruebas. No se ejecutaron las de shared, i18n ni la app; los últimos datos registrados son 261/261 y 186/186 (cierre de las notas del chef).
- Engram no está disponible en la nube: la ventana local guarda las dos entradas de la sección siguiente.

## Espejo Engram
Guardar en Engram (proyecto atelier) con estas claves exactas.

**`atelier/decisiones-memoria-encendida-2026-10`**
```
Decisiones de Andy (10-10-2026), entrega 3 de la memoria culinaria ("memoria encendida"):
1. Sin preguntas al empezar. Nombre del perfil (User.name). El tipo de cocina lo deduce la memoria de productos y técnicas.
2. Ciudad o zona opcional (Restaurant.city), en Nuestra cocina y al crear el restaurante.
3. El asistente recibe el mes actual (temporada).
4. Memoria encendida por defecto: nuevos y los que nunca decidieron; quien la apagó sigue apagado.
5. Botón verde "Memoria" arriba en el chat, abre Nuestra cocina para apagarla.
6. Recetas cargadas: aprobadas si carga un admin; en prueba si carga chef ejecutivo o sous-chef (opción 2: una aprobada solo la edita el admin, también precio y alérgenos). La memoria aprende al momento.
7. Ingredientes más repetidos de todas las recetas en prueba/aprobadas, sin IA, dentro de la memoria.
8. Fuera de alcance: 50 recetas y 7 tendencias (probar antes con Kokoo), aprendizaje diario, carga múltiple, "¿lo recuerdo?".
9. Rutas: Opus 5.5 alto (E5, E7), Codex GPT-6.1 alto (E1, E3, E4, E6), Haiku 5.5 alto (E2, E8, E9).
Plan: odd/tasks/memoria-encendida.md en la rama claude/optimistic-euler-oq7mp1.
```

**`odd/memoria-encendida/tasks`**
```
Plan: odd/tasks/memoria-encendida.md. Rama de trabajo: feat/memoria-encendida (desde origin/claude/optimistic-euler-oq7mp1).
Olas: O1 = E1 · O2 = E2 ‖ E3 ‖ E6 ‖ E8 · O3 = E4 ‖ E5 ‖ E7 · O4 = E9 · cierre.
[ ] E1 cimientos (esquema, migración, contratos, textos) — Codex GPT-6.1 alto
[ ] E2 nombre, ubicación y mes para el asistente — Haiku 5.5 alto
[ ] E3 ingredientes frecuentes en la memoria — Codex GPT-6.1 alto
[ ] E4 memoria encendida al crear y ciudad en el servidor — Codex GPT-6.1 alto
[ ] E5 cargadas aprobadas/en prueba y aprendizaje al momento — Opus 5.5 alto
[ ] E6 app: recetas cargadas — Codex GPT-6.1 alto
[ ] E7 app: botón verde Memoria — Opus 5.5 alto
[ ] E8 app: ciudad — Haiku 5.5 alto
[ ] E9 privacidad y documentación — Haiku 5.5 alto
Estado: plan listo, sin código cambiado. Línea base API 794/794.
```

## Arranque en local
Mensaje para pegar en la ventana local:

```
Retoma la entrega 3 de la memoria culinaria ("memoria encendida") en atelier-2-0.
1. git fetch origin claude/optimistic-euler-oq7mp1 y crea la rama de trabajo:
   git switch -c feat/memoria-encendida origin/claude/optimistic-euler-oq7mp1
2. Lee entero odd/tasks/memoria-encendida.md: es la fuente de verdad (decisiones, tareas E1–E9, especificaciones, criterios y comprobaciones).
3. Guarda en Engram las dos entradas de la sección "Espejo Engram" con sus claves exactas.
4. Ejecuta las olas en orden (O1 → O2 → O3 → O4 → cierre) con las rutas del plan:
   - Opus 5.5, esfuerzo alto: E5 y E7.
   - Codex con GPT-6.1, esfuerzo alto: E1, E3, E4 y E6. Usa el id exacto del modelo que acepte tu CLI; si no puede lanzar procesos con --write, Codex escribe las ediciones y Haiku 5.5 en alto las aplica y corre RED/GREEN.
   - Haiku 5.5, esfuerzo alto: E2, E8 y E9.
   TDD estricto (RED antes de implementar), un commit por tarea, y revisa tú cada tarea antes de pasar a la siguiente ola.
5. Al cerrar cada tarea, marca el checklist y anota la evidencia en el plan y en Engram.
6. No fusiones con main ni despliegues sin que yo lo decida.
```

## Progreso y evidencia
Ventana local, 10-10-2026. Rama `feat/memoria-encendida`, punto de partida `af93843`. RDD: activado (global); porción revisada desde `af93843`.

- **Entorno.** Codex: runtime de la app 0.162.0-alpha.17.2 (`%LOCALAPPDATA%/OpenAI/Codex/bin/2e5e00daee91c61d`) vía companion con `--write --model gpt-6.1-sol --effort high`; su sandbox ejecuta comandos pero no puede abrir esbuild (vitest de api y app) ni escribir `.git`, así que el padre corre esas suites y hace los commits. Postgres desechable: `embedded-postgres` 15.18 (igual que CI, `postgres:15-alpine`) en el scratchpad, puerto 54329, UTF8.
- **Línea base.** api 794/794 y tsc OK; shared 14 archivos verdes; i18n 1; app 186/186; integración de memoria 15/15 en Postgres local.
- **E1** (`7744427`, Codex GPT-6.1 alto; ruta delegada, disparador de escritura: 2+ archivos no triviales).
  - RED (observado por el padre): shared 15 fallos (`city`/`origin` descartados por zod, módulo `recipe-import` inexistente) e i18n 30 fallos (claves que faltan).
  - GREEN: shared 280/280, i18n 35/35, api 794/794, app 186/186; tsc de shared, i18n, db, api y app OK; `git diff --check` OK. El padre corrigió un `noUncheckedIndexedAccess` en el test de i18n.
  - Desvío mínimo: `CulinaryMemoryResponse.city` obligó a que `getCulinaryMemory` devuelva `city` ya en E1 (E4 lo cubre con tests); fixture de la app con `city: null`.
  - Migración en Postgres local: sin memoria → encendida; apagada → sigue apagada; contexto preparado borrado y revisiones a -1; `enabled` por defecto `true`; `city` VARCHAR(80). `migrate diff --from-migrations` contra el esquema solo muestra la deriva de las FK de `CulinaryMemory`/`CulinaryMemoryRun`, que ya existe en `HEAD` sin esta migración (fuera de alcance).
  - RDD: riesgo medio, `under_budget` (193 líneas): pendiente en la porción.
- **Fusión ajena a las tareas.** `4531d2d` (22:21) fusionó `main` local (`5c84bce`: PR #9 contraste del asistente y PR #10 avisos de dependencias) en la rama; no lo hizo ningún agente de esta ventana. Benigna; trae `pnpm-lock.yaml` nuevo (se reinstaló) y un `asistente.tsx` nuevo sobre el que trabaja E7.
- **E2** (`bf64a66`, Haiku 5.5 alto; ruta delegada). RED observado por el agente: 11 fallos (falta `Ubicación`, falta `# Conversación`, la ruta pasa 4 argumentos y no consulta `user.findUnique`). GREEN 53/53 en los dos archivos; el padre lo repitió (53/53) y revisó el diff: identidad cambia solo con ciudad, nombre y mes en el bloque dinámico, sin marcadores nuevos. Tres aserciones antiguas de la ruta ganan el quinto argumento `{ speakerName }`.
- **E8** (`03d398b`, Haiku 5.5 alto; ruta delegada). RED: 5 fallos (`memoryPatchBody` y `createRestaurantBody` no existen). GREEN 7/7 y `hooks-order` 8/8; el padre repitió 15/15 y revisó el diff.
- **E3** (`66d3228`, Codex GPT-6.1 alto, dos fases). RED observado por el padre: 17 fallos (`frequentIngredients`/`loadIngredientStats` no son funciones; contexto sin `ingredientesFrecuentes`). GREEN tras corregir el padre un tipo en `worker.test.ts` (`key` como literal).
- **E6** (`5d94a58`, Codex GPT-6.1 alto, dos fases). RED observado por el padre: 9 fallos (orígenes inválidos aceptados; `buildRecipeRequestBody` no existe). GREEN. Detalle aceptado: `contentJson.ingredients` sale ahora recortado, igual que `recipeIngredients`.
- **Cierre de O2** (padre): api 825/825, app 204/204, shared 280/280, i18n 35/35; tsc de los cuatro OK; `git diff --check` OK. Un primer run de api falló al cargar `leave.test.ts` (intermitente, igual que en la línea base); pasó solo y en la repetición completa.
- **RDD de la porción** `af93843..5d94a58` (incluye la fusión de `main`): riesgo alto solo por `package.json` de `main`; sin la fusión, medio con presupuesto superado (702 líneas). Andy concedió la revisión; linaje `review-bfb3856b4a2d88ae`, cuatro lentes. **Aprobada** y acusada (`authority: burned`); nuevo límite revisado `5d94a58`. 17 avisos informativos, no bloqueantes; los relevantes para lo que falta: la ciudad aún no se persiste en el PATCH y el estado de carga aún no existe en el servidor (los cierran E4 y E5); una app nueva contra un servidor viejo rechazaría `city` en el PATCH estricto (por eso el servidor se publica antes); `chatMemory` recorre hasta 300 recetas al reconstruir el contexto en la ruta del chat (aceptado en el plan); en la vista previa del chat, un fallo al leer el nombre no tiene guarda propia.
- **E7** (`2b14c87`, Opus 5.5 alto; ruta delegada). RED: 7 fallos (no existe `MemoryChip`). GREEN 7/7 y app 211/211 tras añadir el padre dos mocks a `chat-navigation.test.ts` (la pantalla importaba la hoja y la API reales). Diff revisado: sin restaurante no hay botón; oculto mientras carga o si falla; respuestas tardías ignoradas; hooks antes de cualquier `return`. El Lector no lo ve porque leer la memoria exige `capture_idea` (403).
- **E4** (`9372f6e`, Codex GPT-6.1 alto, dos fases). RED observado por el padre: 10 fallos (4 casos ya los cumplía el código: GET con ciudad, PATCH sin ciudad y filas nuevas encendidas sin `turnedOn`). GREEN 120/120 en restaurante y servicio.
- **E5** (`54495d4`, Opus 5.5 alto; ruta delegada). RED unitario 17 fallos (estado `draft`, ventana semanal y reintento activos, `"skipped"` con bloqueo, `learnAfterImport` inexistente, la ruta sin rol ni `after`). RED de integración: 4 fallos con `worker.ts` y `create-recipe.ts` de `HEAD`. GREEN: 66/66 unitarios, integración 19/19 tres veces. Riesgos anotados: el caso de cargas solapadas espera 150 ms fijos; un fallo transitorio tras una carga programa el reintento de 24 h como cualquier intento.
- **Cierre de O3** (padre): api 863/863, app 211/211, shared 280/280, i18n 35/35, tsc OK, integración 19/19 en Postgres local, `git diff --check` OK.
- **RDD de O3** (`5d94a58..54495d4`): riesgo alto (754 líneas). Andy concedió la revisión, pero **quedó en pausa antes de empezar** (ver abajo).
- **Pausa por choque con `codex/asistente-arreglos`** (aviso de la sesión «Arquitectura del asistente», confirmado con `git merge-tree`): conflictos en `messages/route.ts`, `lib/anthropic.ts`, `culinary-memory/worker.ts`, `memory.integration.test.ts`, `(tabs)/asistente.tsx` y el `index.test.ts` de i18n. Esa rama mueve la carga de contexto del chat a `chat-turn-service.ts` (A5), pasa los textos del restaurante y del usuario a datos JSON en `buildSystemBlocks` (A8: la línea cruda «Quien escribe» de E2 reabriría una vía de inyección), rehace `worker.ts` (A9) y divide `asistente.tsx` (A12). El aviso llegó con E5 y E7 ya commiteadas. Decisión de Andy: pausar y adaptar.

- **E9** (Haiku 5.5 alto; ruta delegada). Privacidad (voseo): memoria activada por defecto, cómo apagarla, aprendizaje al cargar y semanal, ingredientes contados sin IA, nombre, ciudad y mes que recibe el asistente. `docs/MEMORIA-ENCENDIDA-2026-10.md` nuevo (incluye «Pendiente») y entrada en `docs/ESTADO-ACTUAL.md`. Sin test de la página (ninguno la renderiza); tsc de api y `git diff --check` OK. Cuando se adapte E2, revisar que la privacidad siga describiendo bien el envío del nombre.

- **Fusión de asistente-arreglos (11-10-2026).** A petición de Andy, el padre fusionó #11 (`5ad3525`), #12 (`4be1b99`) y #13 (`cabc15d`) en `main`, con CI verde en cada uno (#12 y #13 se reapuntaron a `main` y se reabrieron para lanzar CI; ramas sin borrar). `main` se fusionó en la rama (`d66c20d`): el padre resolvió el test de i18n y un escritor Opus 5.5 alto los otros 5 conflictos adaptando E2b/E3b/E5b/E7b:
  - E2b: ciudad en la identidad JSON de A8 solo si existe (texto cacheado idéntico sin ella); `speakerName` y `currentMonth` como datos JSON del bloque dinámico; nombre y ciudad se cargan en `chat-turn-service.ts`; si falla leer el nombre, el turno sigue sin él. RED: 7 fallos en `anthropic.test.ts` (incluido un nombre malicioso con saltos de línea y «# Instrucciones») y 8 en la ruta; GREEN 197/197.
  - E3b/E5b: sobre el `worker.ts` de A9; `"locked"` en `MemoryRunStatus`; próxima revisión `WEEKLY_INTERVAL`. Se mantiene la supresión de A9 también tras una carga: una receta nueva cambia la evidencia y la clave, así que no bloquea el aprendizaje.
  - E7b: `useMemoryChip` en `src/features/assistant/`, con test (RED: módulo inexistente; GREEN 5/5).
  - Tests de A9 adaptados: mocks de `loadIngredientStats` y `migration.a9b.test.ts` comprueba el orden contra su migración en vez de exigir que sea la última.
  - Comprobación del padre: api 1177/1177, app 416/416, shared 291/291, i18n 41/41, tsc OK, integración 22/22 en Postgres local, sin marcadores de conflicto; `npx expo export --platform android`: «android bundles (1)» (`dist` borrado).
- **RDD final** contra `main` (57 archivos, 2.208 líneas): Andy la concedió, pero START devolvió `lens_context_budget_exceeded` y no se creó autoridad de revisión. Revisado: la porción `af93843..5d94a58`. Sin revisar por RDD: E4, E5, E7, E9 y la adaptación.

## Siguiente paso
1. Revisión RDD en candidatos que quepan: dividir lo que la rama añade sobre `main` en PR encadenados (skill `chained-pr`), por ejemplo servidor (E1, E3, E4, E5), asistente (E2) y app (E6, E7, E8) más documentación.
2. Decisión de Andy sobre la entrega: fusión con `main` (Vercel aplica la migración), después binarios de Android e iPhone.
