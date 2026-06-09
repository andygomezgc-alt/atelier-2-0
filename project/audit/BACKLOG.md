# BACKLOG.md — Plan priorizado post-auditoría

Fuente: `project/audit/AUDIT.md` (Pasadas A/B/C). Método: `docs/superpowers/specs/2026-05-19-ux-audit-design.md`.

**GATE:** cero código hasta que Andy apruebe este backlog. Cada ola/ítem se ejecuta: mini-plan → OK de Andy → ejecuto → verifico (Expo Go / tests). Las olas grandes (Ola Visual 2) reciben su propio ciclo spec → plan.

**PATRÓN DE VERIFICACIÓN (obligatorio en todas las olas — aprendido en A-01):**
En este Windows el control de procesos pnpm/next es poco confiable. NO alcanza con "tests verdes + server arrancó OK". Todo fix que toque server/API se verifica **end-to-end real desde el primer momento**: contra el server vivo, con **datos reales del usuario** (fixtures capturados, no texto inventado), y confirmando que hay **un solo** proceso atendiendo el puerto (sin fantasmas duplicados) con el comando y su salida a la vista. Validar componentes aislados (tests, eval de script) NO sustituye el flujo completo.

## Orden de ejecución (decidido por Andy)
`Ola 0 (bugs) → Ola 1 (fricción crítica + onboarding) → Ola Visual 1 (coherencia pre-pilot) → Ola Visual 2 (rediseño Menús) → Ola 3 (polish / menor)`

Severidad: P0 bloquea pilot · P1 alta · P2 media · P3 menor. Esfuerzo: S/M/L.

---

## Ola 0 — Bugs (PRIMERO)
Objetivo: nada roto antes de tocar lo demás. Salida: los 4 ítems verificados.

| # | ID | Qué | Sev | Esf | Notas |
|---|---|---|---|---|---|
| 0.1 | A-01 | Importar receta del Asistente: el `<recipe_payload>` no se emite/parsea → siempre cae al fallback (ingredientes a notas, título = último mensaje). **Diagnóstico primero** (prompt de sistema vs regex `parseRecipePayload` vs modelo/streaming), luego fix. | P1 | S diag → S/M | Causa raíz en `asistente.tsx:209-260`. Usar skill diagnose. |
| 0.2 | A-10 / BX-03 | Race conditions al crear/unirse restaurante: respuesta de API descartada, `refreshMe()` a ciegas, 409 en loop sin guía. | P1 | M | `create-restaurant.tsx:27-31`, `join-with-code.tsx:26-30`. |
| 0.3 | A-11 | Errores de API sin traducir (verify/join/request) — español/inglés a usuarios en italiano. | P2 | M | Tema es/it del pilot. |
| 0.4 | BP-01 | Labels de dry-run de migración hardcodeados (no i18n). | P2 | S | `ajustes.tsx:110-111`. Suma a 0.3. |
| 0.5 | A-01b | El turno de receta del Asistente se corta antes de terminar la prosa (`effort: low` + `max_tokens` en `conversations/[id]/messages/route.ts` → out≈1054/1354, nunca cerca de 2048). "Presupuesto suficiente en turnos de receta del asistente". Descubierto en el diagnóstico de A-01. **Separado de A-01** (A-01 = título+ingredientes vía extracción desacoplada; A-01b = que la receta visible no se corte). | P2 | S/M | No bloquea A-01. |

---

## Ola 1 — Fricción crítica para pilot + onboarding (SEGUNDO)
Objetivo: que un chef nuevo pueda usar la app sin trabarse. Salida: recorrido onboarding + pipeline fluidos.

| # | ID | Qué | Sev | Esf | Notas |
|---|---|---|---|---|---|
| 1.1 | A-12 | Sin guía de primer uso: tras crear/unirse cae en Inicio vacío; no se confirma el restaurante; Asistente sin explicar; invitar equipo escondido. | P1 | M | Núcleo de Motivación C. |
| 1.2 | A-03 | Asistente lento: `ScrollView`+`.map()` sin virtualizar, `scrollToEnd` por delta, bubble sin `memo`. | P2 | M | Pareja con C-05 (Ola Visual 1). |
| 1.3 | A-05 | Stream: timeout 35s silencioso sin heartbeat/progreso. | P2 | S | `conversations.ts:8,134-140`. |
| 1.4 | A-07 | Guardar receta (fallback) sin confirmación/preview. | P2 | S | Se resuelve junto con A-01. |
| 1.5 | A-06 | Importar Google Docs no funciona para Andy aunque está implementado. **Diagnóstico** (picker iOS/Expo Go vs export Drive vs extracción server). | P2 | S diag | `cargar.tsx:34-57`. **Condición:** si el diagnóstico revela fix M-L, mover a post-pilot. No quemar tiempo de Ola 1 en una sola feature compleja. |
| 1.6 | BR-02 | Sin botón "Editar receta" en el detalle (editar existe pero oculto). | P2 | M | `recetas/[id].tsx`. |
| 1.7 | A-13 | Verify: error parpadea 2s y redirige; sin spinner. | P2 | S | `verify.tsx:43,48-57`. |
| 1.8 | BP-05 | **Eliminar** el control de criticidad de la UI del chef (decisión A.5 cerrada: criticidad invisible al chef — quitar, no clarificar). | P2 | S | `editar.tsx:383-385`. Quick-win. Subido de Ola 3. |
| 1.9 | BP-02 | Filtro de productos no persiste entre navegaciones; rompe el flujo cotidiano de carga de precios (sin_precio→detalle→volver). | P2 | S | `index.tsx:171-173`. Subido de Ola 3. |
| 1.10 | BR-03 | Avisos inline de ingrediente (anti-typo/falta-pezzatura) poco visibles; vinculado a calidad final de A.5. | P2 | S | `nueva.tsx:336-370`. Subido de Ola 3. |

---

## Ola Visual 1 — Coherencia visual pre-pilot (TERCERO)
Objetivo: que se vea profesional/coherente para el pilot, sin entrar al rediseño grande de Menús.
**Orden por valor pilot:** 1º **C-02**, 2º **C-05**, luego el resto en cualquier orden.

| # | ID | Qué | Sev | Esf | Notas |
|---|---|---|---|---|---|
| V1.1 | C-02 (G2) | **Serif consistente en Android** — empaquetar fuente serif. Riesgo pilot: identidad editorial degradada en Android. | P2 | M | **Más urgente.** |
| V1.2 | C-05 (G5) | **Asistente al lenguaje editorial** — bubbles card-based, título serif, modelos renombrados (Haiku=Sous-chef, Sonnet=Chef Creativo, Opus=Chef Ejecutivo). Absorbe A-04; coordinar con 1.2 (perf). | P2 | M | **Más urgente.** |
| V1.3 | C-01 (G1) | Sistema de motion — transición tabs + Stack raíz + micro-animación. | P2 | M | Nav estructura NO cambia; solo motion + restyle de la barra (decisión cerrada). |
| V1.4 | C-03 (G3) | Aprovechar teal (verde oscuro) en superficies/CTAs como los mockups. | P2 | S | Alto impacto/bajo esfuerzo. |
| V1.5 | C-04 (G4) | Vocabulario de estados (íconos/badges error/aviso/ok) consistente. Absorbe BP-06, B2-01. | P2 | M | |
| V1.6 | C-06 (G6) / BR-01 | Lista de Recetas = mockup: tarjetas con Coste/PVP + categoría + temporada (exponer campos al tipo `Recipe`). | P2 | M | |

---

## Ola Visual 2 — Rediseño de Menús (CUARTO, dedicada)
Objetivo: el rediseño funcional grande, con foco completo y su propio ciclo spec → plan. Separada para no dejar la app "a mitad de rediseñar" por semanas.

| # | ID | Qué | Sev | Esf | Notas |
|---|---|---|---|---|---|
| V2.1 | C-07 (G7) | Menús = mockups: "Composición de la carta" (menú activo destacado + tags ACTIVO/ARCHIVADO/BORRADOR), detalle con selector de plantilla (Elegante/Moderna/Rústica), vista previa cliente, PDFs distintos por plantilla. Absorbe BR-04 (búsqueda/filtros de menús). | P2 | L | **Requiere su propio brainstorm → spec → plan** antes de ejecutar. |

---

## Ola 3 — Polish / fricción menor (ÚLTIMO, post-pilot u oportunista)
Objetivo: pulido. No bloquea pilot. Ítems baratos pueden adelantarse oportunistamente.

| # | ID | Qué | Sev | Esf | Notas |
|---|---|---|---|---|---|
| 3.1 | A-08d | Chip de idea sin truncar (`inicio.tsx:186`) — puede romper layout. | P3 | S | Quick-win, adelantable. |
| 3.2 | A-08 | Resto del cluster: breadcrumb de workflow, renombrar filtro "En progreso", affordance de invitar staff, indicador de tab activo. | P3 | S c/u | |
| 3.3 | A-14 | Login: input email sin label visible; validación laxa. | P3 | S | |
| 3.4 | BP-03 | Vacío de productos no distingue "sin resultados" vs "categoría vacía". | P3 | S | |
| 3.5 | BP-04 | Indicador "pezzatura pendiente" muy sutil. | P3 | S | |
| 3.6 | BR-05 | Cargar: sin hint de formatos/tamaño; feedback de proceso mínimo. | P3 | S | Liga con 1.5. |
| 3.7 | BR-06 | Matching de productos sin micro-copy explicativo. | P3 | S | |
| 3.8 | BX-02 | Login: transiciones email→enviado→pegar sin indicador de paso; inputs no se limpian al éxito. | P3 | S | Bajado de Ola 1. |
| 3.9 | C-08 | Coherencia menor de Auth: labels onboarding con `Eyebrow` (A-15) + leyenda de roles staff (BX-04). | P3 | S | Bajado de Ola Visual 1 (es P3, no encaja en V1 que es P2). |

---

## Resumen
- **0 ítems P0.** Bugs P1: A-01, A-10. Fricción P1: A-12.
- Olas técnicas (0,1) antes que visuales (V1,V2). Ola Visual 2 aislada por tamaño.
- Decisiones aplicadas: criticidad se elimina (A.5); nav no se reestructura (solo motion/restyle); modelos IA renombrados; es/it foco, en desprioriza.
- Todo ítem trazable a un hallazgo de AUDIT.md con evidencia archivo:línea.
