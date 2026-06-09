# AUDIT.md — Auditoría UX/UI Atelier Culinaire

Documento vivo. Método y decisiones en `docs/superpowers/specs/2026-05-19-ux-audit-design.md`.
Estado: **Pasada A ✓ · Pasada B ✓ · Pasada C ✓ · BACKLOG.md listo para revisión.**

Leyenda: Motivación **A** (polish/coherencia) · **B** (problema concreto) · **C** (onboarding).
Tipo: 🐞 BUG · 🟠 FRICCIÓN · 🎨 POLISH. Severidad: P0 bloquea pilot · P1 alta · P2 media · P3 nice-to-have. Esfuerzo: S/M/L.
IDs re-espaciados en Pasada B: **BP-** Banco de productos · **BR-** Recetas/Menús · **BX-** Auth/chrome.

---

## Pasada A — Recorridos en contexto

### Inventario · Pipeline (Idea → Asistente → Recetas → Menús → Casa)
inicio.tsx (input/guardar idea, card→asistente, editar, eliminar) → asistente.tsx (chip idea, selector modelo, input, enviar, "Guardar como receta") → recetas.tsx (búsqueda, 4 filtros, cards) → recetas/[id].tsx (estado, acciones, prioridad) → cargar.tsx (picker PDF/DOCX/GDoc, botón crear a mano) / nueva.tsx (form ingredientes estructurados, matching banco) → menus.tsx (cards) → menus/[id].tsx (plantilla, platos, precio, link receta, PDF) → casa.tsx (identidad, código invitación, staff).

### Inventario · Onboarding
login (email) → enviado → pegar código → verify (deep link) → choose-flow → create-restaurant / join-with-code → primer landing (Inicio vacío).

### Hallazgos (líneas verificadas en Pasada B)

| ID | Pantalla/Flujo | Qué está mal + evidencia | Mot | Tipo | Sev | Esf |
|---|---|---|---|---|---|---|
| **A-01** | Asistente → Recetas | **Bug de importar — causa raíz.** `asistente.tsx:209-260` `saveAsRecipe()`: camino CORRECTO (220-244) cuando `parseRecipePayload(lastAssistant.content)` halla `<recipe_payload>` → ingredientes estructurados + título real → `/recetas/nueva`. **Fallback roto** (246-258): si no se parsea payload → `title=lastUser.content` (248), `contentJson:{ingredients:[],…,notes}` (254), crea directo. Síntoma de Andy = el payload no se emite/parsea, siempre cae al fallback. Diagnóstico: prompt de sistema vs regex `parseRecipePayload` vs modelo/streaming. | B | 🐞 | P1 | S diag |
| **A-02** | Tabs + root | Sin transición animada. `(tabs)/_layout.tsx:21-45` sin config de animación; **además** `app/_layout.tsx:37-45` (Stack raíz) tampoco. | B/A | 🎨 | P2 | S |
| **A-03** | Asistente | Chat lento: `ScrollView`+`.map()` (`asistente.tsx:243-273`), `scrollToEnd` en cada delta (`useEffect` `:104-106` dep `[messages,streamBuf]`), bubble sin `memo` (`:256-265`). | B | 🟠 | P2 | M |
| **A-04** | Asistente | Estética: bubbles no card-based, sin título serif grande, genérico vs editorial. Andy dio mockup objetivo. | B/A | 🎨 | P2 | M |
| **A-05** | Asistente | `conversations.ts:8` `STREAM_INACTIVITY_MS=35_000`; reset en `:134-140`; sin heartbeat cliente → blanco 35s luego error. | B | 🟠 | P2 | S |
| **A-06** | Recetas/Cargar | **Google Docs ya implementado** (`cargar.tsx:34-40` MIMEs incl. `GDOC_MIME`, `:57` en picker; Android Drive auto-exporta). No es feature faltante: diagnosticar por qué no le funciona a Andy (picker iOS/Expo Go vs export Drive vs extracción server `/api/recipes/upload`). | B | 🟠 diag | P2 | S |
| **A-07** | Asistente → Recetas | Fallback de guardar sin confirmación/preview: crea y navega afuera; chat queda atrás. Se resuelve junto con A-01. | B | 🟠 | P2 | S |
| **A-08** | Recetas/[id], Inicio, Casa, Tabs | Cluster P3 (líneas exactas): workflow sin breadcrumb (`recetas/[id].tsx:144-165`); filtro "En progreso" = todo lo no aprobado (`recetas.tsx:34-35,66-68`, nombre confuso); chip de idea sin truncar (`inicio.tsx:186`, sin `numberOfLines`); staff sin affordance de invitar (`casa.tsx:156-194`); tab activo solo por color (`(tabs)/_layout.tsx:26-27,42-44`). | A/B | 🟠/🎨 | P3 | S c/u |
| ~~A-08c~~ | Menús↔Recetas | **CORREGIDO — no es un problema.** El link recíproco receta→menús **existe** (`recetas/[id].tsx:180-191`), condicionado a `state==="approved"` (comportamiento correcto). Se retira del cluster. | — | ✅ | — | — |
| **A-10** | Crear/Unirse restaurante | **Race conditions.** `create-restaurant.tsx:27-31` y `join-with-code.tsx:26-30`: respuesta del API descartada (`/api/restaurant` `:77-80`, `/join` `:69`), `refreshMe()` a ciegas; si falla → estado roto silencioso; reintento de join choca con 409 "ya estás en un restaurante". | B/C | 🐞 | P1 | M |
| **A-11** | Verify/Join/Request | Errores de API sin traducir: `verify.tsx` muestra error crudo (español) a usuarios en italiano; `request`/`join` español hardcodeado; un mensaje en inglés. | C | 🐞 | P2 | M |
| **A-12** | Post-onboarding → Inicio | **Sin guía de primer uso**: tras crear/unirse cae en Inicio vacío; nunca se confirma el nombre del restaurante; Asistente sin explicar; invitar equipo escondido en Casa. | C | 🟠 | P1 | M |
| **A-13** | Verify | `verify.tsx:43` `setTimeout(...,2000)` redirige antes de poder leer el error; sin `ActivityIndicator` (`:48-57`). | C | 🟠 | P2 | S |
| **A-14** | Login | `login.tsx:100-110` input email sin label visible; `:20` validez = solo `@` y `.` (laxa). | C | 🟠 | P2/P3 | S |
| **A-15** | Auth | Labels de onboarding no usan componente `Eyebrow` como el resto. | A | 🎨 | P3 | S |

### ✅ Buenas noticias (Pasada A, verificadas en B)
- i18n de UI completo y correcto **es/it**; el gap es/it real es solo errores de API (A-11) + labels hardcodeados de migración (BP-…).
- Camino estructurado de importar receta (`<recipe_payload>`) **ya construido y correcto** — bug acotado.
- Crear receta a mano **sí existe** (`cargar.tsx:139`→`/recetas/nueva`).
- Receta↔Menús **es bidireccional y correcto** (corrección A-08c).

### Correcciones a subagentes (transparencia)
1. ❌ "No existe crear receta a mano" → falso. 2. ❌ "Falta Google Docs (L)" → ya implementado, reclasif. diag S. 3. ❌ "No hay parsing de la respuesta" → existe `<recipe_payload>`. 4. Líneas ≈ de Pasada A → re-verificadas exactas en B. 5. ❌ A-08c "menú↔receta de una vía" → es bidireccional/correcto.

---

## Pasada B — Profundidad pantalla por pantalla

Inventario de controles por pantalla completado para las ~22 pantallas (resumen por área abajo; detalle en notas de trabajo). Severidades de subagentes recalibradas (tienden a inflar). **No surgió ningún P0 ni P1 nuevo**; B profundizó evidencia y corrigió A-08c.

### Re-verificación de ítems ≈ de Pasada A
| Ítem | Resultado | Línea exacta |
|---|---|---|
| A-03 chat perf | ✅ Confirmado | asistente.tsx:104-106, 243-273, 256-265 |
| A-05 timeout 35s | ✅ Confirmado | conversations.ts:8, 134-140 |
| A-08a filtro "en progreso" | ✅ Confirmado | recetas.tsx:34-35, 66-68 |
| A-08b sin breadcrumb | ✅ Confirmado | recetas/[id].tsx:144-165 |
| A-08c menú↔receta | 🔁 Corregido (correcto) | recetas/[id].tsx:180-191 (gated approved) |
| A-02 sin animación | ✅ Confirmado | (tabs)/_layout.tsx:21-45; _layout.tsx:37-45 |
| A-10 race conditions | ✅ Confirmado | create-restaurant.tsx:27-31; join-with-code.tsx:26-30 |
| A-08d chip overflow | ✅ Confirmado | inicio.tsx:186 |
| A-08e staff affordance | ✅ Confirmado | casa.tsx:156-194 |
| A-08f tab activo color | ✅ Confirmado | (tabs)/_layout.tsx:26-27, 42-44 |
| A-13 verify 2s/sin spinner | ✅ Confirmado | verify.tsx:43, 48-57 |
| A-14 login sin label/laxa | ✅ Confirmado | login.tsx:20, 100-110 |

### Hallazgos nuevos (curados, dedup vs A)

| ID | Pantalla | Qué está mal + evidencia | Mot | Tipo | Sev | Esf |
|---|---|---|---|---|---|---|
| **BR-01** | Recetas (lista) | Tarjetas sin **Coste/PVP + categoría + temporada** vs tu mockup "Banco de recetas / RECETARIO". `recetas.tsx:146-171` solo muestra título/estado/prioridad/autor; el tipo `Recipe` no expone esos campos a la lista. | A/B | 🟠 | P2 | M |
| **BR-02** | Recetas (detalle) | Sin botón **"Editar receta"**: editar existe solo vía `editId` oculto en `nueva.tsx`; el chef no descubre cómo editar una receta. `recetas/[id].tsx:144-165`. | B | 🟠 | P2 | M |
| **BR-03** | Recetas (nueva) | Avisos inline de ingrediente (anti-typo / falta-pezzatura) fáciles de no ver: texto chico mute, sin ícono. `nueva.tsx:336-370`. | B | 🟠 | P2 | S |
| **BR-04** | Menús (lista) | Sin búsqueda ni filtros (a diferencia de Recetas); escala mal con muchos menús. `menus.tsx:11-63`. | B | 🟠 | P2/P3 | M |
| **BR-05** | Recetas/Cargar | Sin hint de formatos/tamaño soportados; feedback de proceso mínimo (sin progreso ni cancelar). `cargar.tsx` hint + `:121-125`. Liga con A-06. | B | 🟠 | P3 | S |
| **BR-06** | Recetas (nueva) | Flujo de matching de productos sin micro-copy ("¿quisiste decir?" vs "crear nuevo"). `nueva.tsx:273-370`. | B | 🟠 | P3 | S |
| **BP-01** | Productos/Ajustes | Alert de dry-run de migración con labels hardcodeados (no i18n) — suma al tema es/it de A-11. `ajustes.tsx:110-111`. | C/B | 🐞 | P2 | S |
| **BP-02** | Productos (lista) | Estado de filtro no persiste entre navegaciones (vuelve a "all"); rompe el flujo sin_precio→detalle→volver. `index.tsx:171-173`. | B | 🟠 | P2 | S |
| **BP-03** | Productos (lista) | Vacío no distingue "sin resultados para query+filtro" vs "categoría vacía". `index.tsx:355`. | B | 🟠 | P3 | S |
| **BP-04** | Productos (lista) | Indicador "pezzatura pendiente" muy sutil (itálica, igual que hint de unidad). `index.tsx:434-437`. | B | 🎨 | P3 | S |
| **BP-05** | Productos/Editar | Control de criticidad expuesto al chef. **Decisión A.5: la criticidad es invisible al chef.** Acción = **eliminar el control de la UI** (no clarificar el label). `editar.tsx:383-385`. | B | 🟠 | P2 | S |
| **BP-06** | Productos (cluster) | Polish: botón Guardar deshabilitado solo por opacidad (sutil); `DebouncedTextInput` sin feedback visual en fallo de guardado; form de yield sin separación visual. | A | 🎨 | P3 | S |
| **BX-01** | Chrome (root) | Stack raíz sin transición — extiende A-02. `_layout.tsx:37-45`. | A/B | 🎨 | P3 | S |
| **BX-02** | Login | Transiciones email→enviado→pegar sin indicador de paso; inputs no se limpian al éxito (texto viejo al reentrar). | C | 🟠 | P3 | S |
| **BX-03** | Join-with-code | 409 "ya estás en un restaurante" en loop sin guía "salí del restaurante primero". Extiende A-10. | C | 🟠 | P2 | S |
| **BX-04** | Casa | Bordes de avatar de staff por rol sin leyenda (admin=terracota, chef=teal) — confuso para nuevos. `casa.tsx:299-300`. | C | 🎨 | P3 | S |

### Notas para Pasada C (no son hallazgos)
- Verde oscuro del tema posiblemente sub-utilizado / revisar export en `theme`. Se evalúa en la baseline de diseño.
- Sin sistema de estados error/warning/success más allá del color (sin íconos/badges). Se evalúa en C.

### Ideas backlog (registradas, NO hallazgos de pilot)
Modo de carga rápida de pezzatura desde la lista; mostrar en detalle de producto si alguna receta override-ea su peso. Fuera de alcance del pilot; quedan anotadas.

### ✅ Buenas noticias (Pasada B)
- Banco de productos: arquitectura sólida y coherente con el lenguaje editorial; pezzatura bien integrada; edición inline robusta (`EditableCell`/`DebouncedTextInput`). Sin reescrituras estructurales.
- Pasada A se sostuvo: 11/12 confirmados con línea exacta, 1 corrección a favor.

---

## Pasada C — Sistema de diseño y coherencia

### Baseline (fuente de verdad: `apps/mobile/src/theme/index.ts`)
Sistema de tokens **sólido y editorial, sin necesidad de reescritura**. Paleta: paper `#f9f7f2` / paperWarm `#f4ede0` / **teal (verde oscuro) `#1a3a3a`** / terracota `#c47e4f` / ink `#2a2520` / mute `#8b7a6f` / danger `#a45a4a`. Tipografía: serif itálico (display 36 → md 18) + sans (body 14 → eyebrow 10.5, ls 1.4). Spacing 4–32, radii 6–pill. Ya coincide con la dirección de los mockups (crema + serif + terracota + tarjetas + eyebrow). El gap es **coherencia, motion y paridades puntuales**, no el estilo base.

### Hallazgos (8 brechas, formalizadas)
| ID | Brecha | Qué falta | Mot | Tipo | Sev | Esf |
|---|---|---|---|---|---|---|
| **C-01** (G1) | Motion | Cero transición tabs + Stack raíz (A-02, BX-01) + micro-animación. Lo que más "se siente pro/fluido". | A/B | 🎨 | P2 | M |
| **C-02** (G2) | Serif en Android | `fonts.serif` = Iowan Old Style **solo iOS**; Android cae a serif genérico → identidad editorial degradada. **Riesgo pilot.** Empaquetar fuente serif. | A | 🎨 | P2 | M |
| **C-03** (G3) | teal sub-usado | Verde oscuro definido pero usado solo en branding/avatares; mockups lo usan en superficies (menú activo, CTAs). | A | 🎨 | P2 | S |
| **C-04** (G4) | Vocabulario de estados | Error/aviso/ok solo por color e inconsistente entre componentes (EditableCell borde rojo vs DebouncedTextInput toast vs Pezzatura inline). Sin íconos/badges. | A | 🎨 | P2 | M |
| **C-05** (G5) | Asistente editorial | Bubbles no card-based, sin título serif, modelos sin renombrar (= A-04; pareja con A-03 perf). Lo pediste explícito. | A/B | 🎨 | P2 | M |
| **C-06** (G6) | Recetas lista = mockup | Tarjetas con Coste/PVP + categoría + temporada (= BR-01). | A/B | 🟠 | P2 | M |
| **C-07** (G7) | Menús = mockup | "Composición de la carta", selector de plantilla, vista previa cliente, PDFs por plantilla (absorbe BR-04 búsqueda/filtros). **Rediseño funcional grande.** | A/B | 🟠 | P2 | L |
| **C-08** (G8) | Auth coherencia | Labels onboarding con `Eyebrow` (= A-15) + leyenda de roles staff (BX-04). | A | 🎨 | P3 | S |

### Correcciones a subagentes (transparencia)
- ❌ B3-10 "verde oscuro no exportado / falta en tema" → **falso**: `teal: "#1a3a3a"` está exportado. Real: sub-utilizado → C-03.

### Descubrimiento
- **C-02 (serif Android)** no estaba en los hallazgos de subagente; surgió al leer `theme/index.ts:22-26`. Elevado: riesgo concreto de pilot si algún chef usa Android.

### ✅ Buenas noticias (Pasada C)
- El sistema de diseño base ya es coherente y alineado con tus mockups. Ninguna brecha exige reescribir tokens; todas son **aditivas**.

---

## Estado final
Pasadas A/B/C completas. Backlog priorizado en `project/audit/BACKLOG.md`. **Cero código tocado en todo el audit.** Gate: aprobación de BACKLOG.md antes de ejecutar cualquier ola.
