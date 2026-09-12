# Auditoría de limpieza — duplicación, código muerto y rendimiento

**Fecha:** 2026-07-17 · **Modo:** solo lectura (no se modificó nada) · **Alcance:** `apps/api`, `apps/mobile`, `packages/*`, `schema.prisma`.

---

## Resumen para el chef (sin tecnicismos)

La app está **limpia y bien cuidada** — poco código muerto de verdad, sin librerías inútiles peligrosas, y el trabajo pesado (calcular costos) ya está donde debe. Hay **duplicación** (el mismo código copiado en varios sitios), que no rompe nada pero hace que cada cambio futuro haya que hacerlo N veces y sea fácil que un sitio se quede desactualizado — igual que el bug de las etiquetas fantasma.

Como estás a punto de distribuir a iPhone, la recomendación clave: **hacer AHORA solo un lote pequeño de arreglos de alto valor y bajo riesgo, y dejar las "unificaciones bonitas" para después del lanzamiento** (reducen líneas pero pueden introducir regresiones visuales justo antes de enseñarla a chefs). Para cada arreglo va su **riesgo de rotura** y qué probar.

---

## P0 — Corregir antes del piloto (bug real, no estético)

### P0-1 · Un renglón de producto se re-dibuja entero al editar cualquier precio
- **Qué es:** en la pantalla de productos, al escribir un precio/merma se re-renderizan **todas** las filas visibles, no solo la que editas. Los handlers `handleSavePrice`/`handleSaveMerma` dependen de `items`, que cambia en cada tecla → se rompe la memoización (`React.memo`) de cada `ProductRow`.
- **Dónde:** [productos/index.tsx:215-242, 244-270, 304-314](apps/mobile/app/productos/index.tsx); filas en `:462-548`.
- **Por qué importa:** es la pantalla con edición más frecuente. Con un banco grande de productos, cada tecla mueve toda la lista → se siente lento/con saltos justo donde el chef trabaja rápido.
- **Fix:** estabilizar los callbacks con `setState` funcional (sin depender de `items`).
- **Riesgo de rotura: MEDIO.** Un callback mal estabilizado puede capturar un valor viejo (closure obsoleto) y hacer rollback sobre el precio equivocado, o pisar dos ediciones rápidas. **Probar:** editar varias filas seguidas, dos cambios sobre la misma fila, y un error de red (que el rollback deje el valor correcto).

### P0-2 · Inconsistencia de robustez entre recetas/productos y menús (mismo patrón resuelto 2 veces distintas)
- **Qué es:** menús ya usa el patrón atómico correcto (`updateMany({ where: { id, restaurantId, deletedAt: null } })`, con un comentario que dice explícitamente que es lo correcto), pero recetas y productos siguen con el patrón viejo de dos pasos (`findUnique` → comprobar → `update` por id). Es duplicación que además **diverge en seguridad**.
- **Dónde:** bien: [menus/[id]/route.ts:47-55, 72-77](apps/api/app/api/menus/[id]/route.ts). Viejo: [recipes/[id]/route.ts:74, 246](apps/api/app/api/recipes/[id]/route.ts), [products/[id]/route.ts:67, 217](apps/api/app/api/products/[id]/route.ts).
- **Por qué importa:** es la misma invariante de aislamiento entre restaurantes que ya reforzamos en la auditoría de seguridad. Uniformar al patrón atómico cierra cualquier resquicio de concurrencia.
- **Fix:** llevar recetas/productos al mismo `updateMany` atómico tenant-scoped; extraer el patrón compartido después.
- **Riesgo de rotura: MEDIO.** Puede cambiar qué código de error/estado se devuelve, o el comportamiento ante un registro ya borrado. **Probar expresamente:** recurso de otro restaurante, inexistente, ya borrado, activo, y dos operaciones concurrentes. Mantener el `findUnique` posterior (tenant-scoped) si se necesita devolver la entidad completa.

---

## P1 — Alto valor, riesgo controlable (haría YA, en cambios pequeños)

Ordenados por relación valor/riesgo.

### P1-1 · Falta un índice de base de datos en `MenuItem.recipeId` · riesgo BAJO
- **Qué es:** la consulta "¿en qué menús está esta receta?" (los chips "Nei menù") corre en **cada** apertura/edición/duplicado de una receta, pero la columna que filtra no tiene índice → Postgres recorre toda la tabla `MenuItem`.
- **Dónde:** [schema.prisma:385-400](packages/db/prisma/schema.prisma) (solo hay índices en `menuFolderId`/`sectionId`); uso en [projections.ts:76-80](apps/api/lib/projections.ts).
- **Fix:** añadir `@@index([recipeId])` (migración Prisma).
- **Riesgo: BAJO en código, MEDIO en despliegue.** Una migración puede bloquear la tabla un instante. **Mitigación:** aplicarla ahora que hay pocos datos es lo más barato; se aplica sola en el próximo deploy.

### P1-2 · Lecturas que traen datos de más (`select` faltante) · riesgo BAJO
- **Qué es:** varias consultas traen la fila completa cuando solo usan 3-4 campos: recetas cargan el `contentJson` entero (puede ser grande) solo para comprobar permisos; el listado de productos trae notas y aliases que no se muestran (con `take: 500`).
- **Dónde:** [recipes/[id]/route.ts:74, 246](apps/api/app/api/recipes/[id]/route.ts); [products/route.ts:68-77](apps/api/app/api/products/route.ts) (proyección en [lib/products/projections.ts:24-53](apps/api/lib/products/projections.ts)).
- **Fix:** añadir `select` mínimo.
- **Riesgo: BAJO.** Alguna rama podría usar un campo silenciosamente. **Mitigación:** TypeScript marca los accesos faltantes; probar el flujo exitoso + 404.

### P1-3 · Helpers idénticos copiados (dinero, nombres de archivo, compartir PDF) · riesgo MEDIO
- **Qué es:** funciones que hacen exactamente lo mismo, copiadas: `parseEurosToCents` (3 copias en productos), `centsFromInput`+`formatPrice` (2 copias), `sanitizeFilename` (2 idénticas + 1 variante distinta), y el patrón de descargar+compartir PDF reimplementado 3 veces aunque ya existe la librería [export-file.ts](apps/mobile/src/lib/export-file.ts).
- **Dónde:** [productos/[id].tsx:69, index.tsx:133, nuevo.tsx:50]; [menus/[id].tsx:91-109]; [menus.tsx:125-141]; [recetas/[id].tsx:113-133]. `money.ts` ya tiene `formatEuros` pero no el parseo inverso.
- **Fix:** consolidar las copias **idénticas** en `money.ts` / `export-file.ts`; modelar la variante distinta de `sanitizeFilename` con un parámetro explícito, no forzarla.
- **Riesgo: MEDIO.** Puede romper el manejo de coma decimal, negativos, campos vacíos, o el MIME/URI de compartir en iOS. **Mitigación:** tests de tabla para el dinero + probar exportar/cancelar/compartir en el iPhone real.

### P1-4 · Un solo escape de HTML para los PDF · riesgo MEDIO
- **Qué es:** la función que "escapa" el texto del usuario en los PDF está copiada 3 veces idéntica + una 4ª versión distinta en la librería de plantillas. Recetas y productos generan su HTML a mano en vez de usar la librería compartida.
- **Dónde:** [recipes/[id]/pdf, recipes/export/pdf, products/export/pdf/route.ts:~19-26]; 4ª versión en [lib/pdf/templates.ts:63](apps/api/lib/pdf/templates.ts).
- **Fix:** una única función de escape usada por todos (no hace falta migrar todo el sistema de plantillas todavía).
- **Riesgo: MEDIO.** Doble escape o diferencias con comillas/apóstrofes. **Mitigación:** snapshot del HTML con `& < > " '`, acentos y contenido raro.

### P1-5 · Usar el `StatusBadge` compartido para el estado de receta · riesgo BAJO-MEDIO
- **Qué es:** la lista de recetas define su propio `StateChip` (mapa estado→color) desde cero, en vez de generalizar el `StatusBadge` que ya unificamos (el precedente que te gustó).
- **Dónde:** [recetas.tsx:364-382](apps/mobile/app/(tabs)/recetas.tsx) vs [StatusBadge.tsx:16-41](apps/mobile/src/components/StatusBadge.tsx).
- **Fix:** reemplazar solo el `StateChip` por `StatusBadge` (ampliando su mapa si hace falta). **Dejar la unificación completa de RecipeCard/MenuCard para después.**
- **Riesgo: BAJO-MEDIO.** Pueden cambiar colores/etiquetas/tamaños. **Mitigación:** tabla explícita de estados + comparación visual.

### P1-6 · `autoEnrich` y consultas de "uso de producto" duplicadas/redundantes · riesgo BAJO-MEDIO
- **Qué es:** (a) `autoEnrich` está copiada en dos rutas de recetas (ya marcada como deuda en un comentario). (b) el detalle de producto hace **2 consultas casi iguales** a la misma tabla que se pueden fusionar en 1.
- **Dónde:** [recipes/route.ts:14-36](apps/api/app/api/recipes/route.ts) y [recipes/[id]/route.ts:13-34]; consultas en [lib/products/usage.ts:11-37](apps/api/lib/products/usage.ts) usadas en [products/[id]/route.ts:28-29, 191-193].
- **Fix:** extraer `autoEnrich` a `lib/`; fusionar las dos consultas en una y contar en memoria.
- **Riesgo: BAJO-MEDIO.** El conteo podría diferir por nulos/mayúsculas. **Mitigación:** correr ambos algoritmos sobre los mismos fixtures y comparar.

---

## P2 — Deuda válida, no prioritaria ahora (después del lanzamiento)

Todo esto **reduce líneas pero es mayormente estético o de escala** — el riesgo de tocarlo justo antes del piloto no compensa:

- **P2-a · 3 pantallas de papelera idénticas** (~95 líneas): unificar en un `TrashScreen<T>` genérico. Riesgo MEDIO (estados de carga, claves de fila, foco). [recetas/productos/menus/papelera.tsx].
- **P2-b · 3 endpoints "restore" casi idénticos**: parametrizar. Riesgo MEDIO. Hacer **después** de P0-2 (no abstraer el patrón viejo).
- **P2-c · Barra de búsqueda+filtros duplicada** (recetas/productos, ~65 líneas): riesgo MEDIO (teclado, foco, pills).
- **P2-d · Estilo "eyebrow" redefinido en 8+ sitios** pese a existir `<Eyebrow>`: migrar pantalla por pantalla, no en masa. Riesgo MEDIO.
- **P2-e · Spinner `ActivityIndicator` literal en 9 sitios; tarjeta "card" duplicada; `formatDate`/`formatEuro`/`LANGS` en los export**: cosméticos, oportunistas.
- **P2-f · Hook `useReloadOnFocus`** para el boilerplate de recarga en 10 pantallas: solo si se hace bien (deps, errores, cancelación). El boilerplate explícito es más seguro que un hook incompleto.
- **P2-g · Paralelizar el `message.create` del chat**: es hot-path pero **no tocar a ciegas** — antes hay que confirmar si el historial que se manda al modelo debe incluir el mensaje recién creado. [conversations/[id]/messages/route.ts:129-160].

**Rendimiento que NO vale la pena tocar ahora** (optimizaciones sin retorno a escala de 1-2 usuarios): agrupar updates del recalc (R6), paralelizar el cron de criticidad (R7), bulk en la migración (R8, riesgo ALTO), creates en bucle al duplicar menú (R9, 2-6 secciones), memoizar las papeleras (R11).

---

## Código muerto (todo P2 — limpieza separada, con typecheck+build)

**Borrado seguro** (0 usos, evidencia fuerte; riesgo BAJO):
- [Placeholder.tsx](apps/mobile/src/components/Placeholder.tsx) — el propio comentario dice "Phase 0, 0.8 will rewrite anyway".
- [useSession.ts](apps/mobile/src/hooks/useSession.ts) — mock de Phase 0, reemplazado por `useAuth` (usado 28 veces).
- Exports huérfanos: `AllergenIconBox` ([AllergenIcon.tsx:112]), `categoryColor` ([CategoryIcon.tsx:44]).
- 7 imports sin usar (`useRef` en menus/[id], `TextInput` en productos/[id], `Circle` en AllergenIcon, `useEffect` en PezzaturaField, `View` en SectionPickerSheet, `useEffect`+`useState` en useAuth). **No hay ESLint configurado** — por eso quedaron; conviene añadir la regla `no-unused-vars` (hay un TODO en `ci.yml:59`).

**NO borrar sin confirmar contigo** (posible uso operativo/pendiente):
- `recalcCriticality` (móvil) — puede ser una feature a medio cablear (el botón de disparar recalc), no muerta.
- Los ~34 scripts de `apps/api/scripts/` (`_*.ts` de incidentes puntuales + `dev-kitchen-*`/`migration-*`/`backfill-*`): no cuestan nada en runtime; podrían ser tu única receta de diagnóstico/recuperación. Documentados en `project/A5-cierre.md`. **Recomendación: dejarlos** (o archivarlos), no borrar.
- ~7 dependencias de Expo sin import directo (`@expo/metro-runtime`, `expo-constants`, `expo-linking`, `react-native-gesture-handler`, `react-native-screens`, `react-native-web`, `@expo/dom-webview`) y `react-dom` en la API: casi seguro las usa el toolchain (bundler/plugins), **NO desinstalar a ciegas** — romperían el build.

**Descartados** (parecían muertos, verificado que NO lo son): `renderRustic`/`renderMinimal` (se usan vía tabla), `expo-splash-screen`/`react-native-worklets` (plugins), `puppeteer` (import dinámico).

---

## Recomendación: dos lotes

**HARÍA YA** (lote pre-piloto, alto valor / bajo-medio riesgo):
- P0-1 (memo de productos), P0-2 (patrón atómico recetas/productos)
- P1-1 (índice `MenuItem.recipeId`), P1-2 (`select` mínimos)
- P1-3 (helpers idénticos de dinero/archivo), P1-4 (escape HTML único), P1-5 (StatusBadge en recetas)
- Borrado seguro de código muerto (Placeholder, useSession, exports/imports huérfanos) — **como commit separado**, con typecheck+build.

**DESPUÉS DEL LANZAMIENTO** (unificaciones estéticas y optimizaciones sin retorno a escala piloto):
- Todo P2 (papeleras, restore parametrizado, barra búsqueda, eyebrow, hook de recarga, paralelizar chat) y R6-R11.

---

## Cómo se verificó
Equipo de agentes en modo solo-lectura (duplicación, código muerto, rendimiento) recopilando evidencia con archivo:línea; priorización P0/P1/P2 y estimación de riesgo de rotura por refactor con Codex (gpt-5.6) sobre el material inline; síntesis y control final propios. Nada se modificó.
