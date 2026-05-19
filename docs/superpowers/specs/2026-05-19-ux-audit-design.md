# Spec — Auditoría UX/UI de Atelier Culinaire

**Fecha:** 2026-05-19
**Estado:** Aprobado (conversacional, con ajustes incorporados)
**Tipo:** Auditoría/discovery — NO implementación. La implementación se planifica por ola, después de aprobar `BACKLOG.md`.

## Contexto

App de gestión de recetas/restaurante (React Native + Expo, monorepo pnpm con `apps/api` Next.js, `packages/{db,shared,i18n}`). Chef Andy quiere una auditoría detallada de toda la funcionalidad, botones e interfaces antes de un pilot con otros chefs.

### Tres motivaciones
- **A — "Algo no me gusta pero no sé qué":** que se vea más profesional, fluido, coherente.
- **B — Problemas concretos:** pantallas/flujos lentos, confusos o mal organizados (lista pre-cargada abajo).
- **C — Preparar el pilot:** bajar fricción de onboarding para chefs que no conocen la app.

### Perfil del pilot
Chefs profesionales, cómodos con celular. Idioma primario **español**, secundario **italiano** (restaurante en Ancona). Inglés existe (i18n es/en/it) pero se desprioriza para el pilot. La auditoría revisa calidad de textos **es/it**.

### Modelo mental del producto (columna vertebral del audit)
`Idea (Inicio) → Asistente (desarrollar) → Recetas (aprobar) → Menús (componer) → Casa (staff, banco de productos, datos)`

### Decisiones cerradas
1. **Navegación:** se mantiene la estructura actual de 5 tabs (Inicio · Casa · Recetas · Menús · Asistente), mismos nombres y orden. Solo restyle estético de la barra. Sin botón central, sin rediseño de IA. Los mockups guían estilo y layout por pantalla, no la navegación.
2. **Nombres de modelos IA** (para Asistente): `Haiku = Sous-chef` (rápido, ediciones simples, dudas concretas) · `Sonnet = Chef Creativo` (default, balance creatividad/velocidad) · `Opus = Chef Ejecutivo` (modo profundo, técnica avanzada, problemas complejos). Razón: alinea capacidad real del modelo con jerarquía de brigada.
3. **Estilo base:** se mantiene el estilo actual de la app; los 6 mockups (Menús ×3, Asistente, Banco de recetas, Ideas/Cuaderno) guían organización de botones y color; se recomiendan mejoras de diseño donde se justifiquen.

## Enfoque: auditoría híbrida en 3 pasadas

- **Pasada A — Recorridos en contexto:**
  1. Pipeline: Idea (Inicio) → Asistente → Recetas → Menús → Casa.
  2. Onboarding chef nuevo: primer arranque → login/verificar → elegir flujo → crear/unirse restaurante → primera acción útil.
- **Pasada B — Profundidad pantalla por pantalla:** las ~22 pantallas (Auth ×5, Tabs ×5, Productos ×5, Recetas ×3, Menús, layouts). Inventario de cada botón/control, que no se escape nada.
- **Pasada C — Coherencia de sistema de diseño (transversal):** color, tipografía, espaciado, radios, componentes, motion (transición de tabs, loaders, "Atelier piensa") contra el lenguaje de los mockups + estilo actual. Sale una *baseline* de diseño documentada para que la Motivación A sea objetiva.

## Taxonomía de hallazgos

Cada hallazgo es una fila con:

`ID · Pantalla/Flujo · Qué está mal + evidencia (archivo:línea o repro) · Motivación (A/B/C) · Tipo (🐞 bug / 🟠 fricción / 🎨 polish) · Severidad (P0 bloquea pilot / P1 alta / P2 media / P3 nice-to-have) · Esfuerzo (S/M/L) · Recomendación`

### Hallazgos pre-cargados (de la conversación)
- **F-bug-import:** Importar receta del Asistente a Recetas — los ingredientes no se separan (todo cae en *notas*), y el título queda como el último mensaje del usuario en vez de un título real. 🐞 Bug · B · P0/P1.
- **F-asistente-chat:** Chat del Asistente poco estético y lento. 🎨+🟠 · B · P1.
- **F-tabs-motion:** Cambio entre tabs sin transición/animación. 🎨 · B · P2.
- **F-import-gdocs:** Importar receta solo soporta PDF (Drive/móvil); falta Google Docs. 🟠 · B · P2.
- **F-menus-reorg:** Menús — reorganizar, más estético/intuitivo (mockups: lista "Composición de la carta", detalle con selector de plantilla Elegante/Moderna/Rústica, vista previa cliente). 🎨+🟠 · B · P1.
- **Intenciones por pantalla a respetar:** Inicio/Ideas mantiene botones editar/eliminar y comportamiento "idea enviada → desaparece del panel"; Asistente conserva los 3 modelos IA (renombrados); Banco de recetas muestra Coste/PVP en las tarjetas.

## Priorización → backlog en olas
- **Ola 0 — Bugs** (importar receta, etc.)
- **Ola 1 — Fricción crítica para pilot + onboarding** (asistente lento, Menús, claridad onboarding)
- **Ola 2 — Coherencia de diseño** (tokens, motion de tabs, restyle por pantalla vs mockups)
- **Ola 3 — Polish / nice-to-have**

Orden dentro de cada ola: `Severidad × peso de Motivación`, luego `Esfuerzo`. El lente pilot (C) y los bugs (B/🐞) flotan arriba.

## Entregables
- `project/audit/AUDIT.md` — tabla completa de hallazgos + baseline de diseño + notas por pantalla.
- `project/audit/BACKLOG.md` — olas priorizadas, cada ítem listo para plan.
- Este spec: `docs/superpowers/specs/2026-05-19-ux-audit-design.md`.

## Ritmo de trabajo
1. **Cero código hasta que se apruebe `BACKLOG.md`.**
2. Se entrega un resumen al **final de cada pasada (A, B, C)**; Andy revisa y corrige rumbo antes de seguir.
3. Tras aprobar el backlog: cada ola/ítem va mini-plan → OK de Andy → ejecuto → verifico (Expo Go / tests).
4. La planificación de implementación (skill writing-plans) se invoca **por ola, después** de aprobar el backlog — no antes.

## Fuera de alcance
- Rediseño de la estructura de navegación (decidido: solo restyle).
- Tocar código durante las pasadas A/B/C (solo análisis/lectura).
- Cambios de backend salvo que un hallazgo lo exija y entre al backlog aprobado.
