# Prompt del asistente — función clara, conciso y adaptado al estilo de cada chef

- **Rama:** `feat/prompt-asistente` (sale de `origin/main` 9c54198), worktree `.claude/worktrees/prompt-asistente`
- **Origen:** conversación del 11-10-2026. Andy preguntó si convenía darle comportamientos al asistente desde el prompt, pidió los cambios y aprobó el borrador v2 («sí, pásalo al archivo y armamos la prueba»).
- **Espejo en Engram:** `odd/prompt-asistente/tasks`

## Objetivo
Reescribir `apps/api/lib/anthropic-system.md`, el prompt que comparten los modos Diario y Creativo, para que el asistente:
- tenga la función clara y sea conciso;
- adapte sus propuestas al registro de cocina de cada chef: en la clásica, pulir dentro del canon; en la de vanguardia, ideas menos obvias con base técnica;
- diga de entrada lo que no tiene fundamento en la ciencia del sabor o no funciona, con el porqué y la alternativa, dejando la decisión al chef;
- cierre siempre con una mejora concreta de la receta;
- sea breve, pero completo al dar una técnica;
- responda en el idioma y con el trato del chef.

Después, medir con una prueba si el prompt nuevo supera al actual antes de desplegarlo.

## Problema
- El prompt actual empuja a todos los chefs hacia la vanguardia: habla de «alta cocina» (línea 3), pone ejemplos de hidrocoloides y N₂O (línea 9) y pide un tono «italiano de Marche» (línea 19).
- Mezcla tú y voseo (líneas 3-9 frente a 34-47) y no fija el idioma de respuesta, aunque la app está en español, italiano e inglés.
- Ante una idea anclada siempre pregunta primero, y cada mensaje gasta cupo: 8 Creativos y 140 Diarios cada 7 días.
- No fija los títulos de la receta. Una receta en italiano titulada «Metodo» no la reconoce el detector de «Guardar receta» (`apps/mobile/src/lib/recipe-conversation.ts:8`), que entonces manda la conversación entera a extracción.

## Decisiones
- Solo prompt, sin código. El estilo se deduce de lo que ya llega al modelo: la identidad, las notas del chef, la memoria culinaria (claves `cuisine`, `techniques` y `complexity`) y los títulos de las recetas recientes. Si no alcanza, el paso siguiente sería un campo explícito de estilo, fuera de este alcance.
- Títulos de receta: Ingredientes/Método, Ingredienti/Procedimento e Ingredients/Method. El detector acepta los seis.
- La cabecera `# Atelier` se mantiene porque la exige `apps/api/lib/__tests__/anthropic.test.ts:219`.
- Se mantiene «no añadas JSON ni bloques ocultos», ahora con su motivo: el historial puede traer bloques viejos que el cliente filtra con `stripRecipePayload`.
- El texto aprobado es el v2 de la conversación: 868 palabras, frente a las 802 del actual.

## Alcance autorizado
- `apps/api/lib/anthropic-system.md` y un test de contrato en `apps/api/lib/__tests__/anthropic.test.ts`.
- La prueba: casos, runner y calificación en `apps/api/evals/prompt-asistente/`, una configuración de vitest para evals y un script en `apps/api/package.json`.
- Ejecutar la prueba hace llamadas pagadas a Anthropic y a Gemini. Cada corrida necesita el OK explícito de Andy, con el costo estimado, el destino y las credenciales.
- Fuera de alcance: el código del chat, un campo de estilo de cocina y el detector de recetas.

## Restricciones
- TDD estricto (fuente: `~/.claude/CLAUDE.md`, «Strict TDD Mode: enabled»). Runner: `vitest run` (`pnpm -C apps/api test`).
- Conventional Commits sin atribución de IA.
- Entrega: `ask-on-risk`. Previsión: P1 unas 110 líneas y la prueba (P2-P3) unas 450, unas 560 en total. Antes del commit que supere las 400 hay que preguntar la estrategia de cadena.
- La carpeta principal está en `feat/memoria-encendida`, que trabaja otra sesión. Todo se hace en este worktree.

## Tareas
- [x] P1 — prompt v2 en `anthropic-system.md` más un test de contrato de los títulos de receta. Ruta: directa. Disparador: un archivo mecánico, porque el texto ya está aprobado, más un test pequeño; no llega al umbral de escritor.
- [ ] P2 — casos de la prueba, para que Andy los apruebe. Ruta: directa; son decisiones de producto del orquestador.
- [ ] P3 — runner y calificación (comprobaciones deterministas más un juez) en `apps/api/evals/prompt-asistente/`. Ruta: delegada, un escritor. Disparador: dos o más archivos no triviales.
- [ ] P4 — piloto pagado, con OK, y aprobación de la calificación por Andy.
- [ ] P5 — corrida completa, reporte y decisión: ajustar el prompt si hace falta.

## Criterios de aceptación
- P1: el prompt empieza con `# Atelier` y nombra los títulos de receta que acepta el detector en español, italiano e inglés. La suite de la API y el typecheck pasan.
- Prueba:
  - Andy aprueba los casos y, después de ver el piloto, también la calificación.
  - La corrida compara el prompt actual (`baseline`) con el nuevo (`v1`) en Creativo (Opus 5.5) y en Diario (Gemini 3.8 Flash).
  - El reporte trae el resultado de cada caso.

## Comprobaciones
- `pnpm -C apps/api test`
- `pnpm -C apps/api typecheck`

## Progreso y evidencia
- P1, test nuevo: `principios — contrato con «Guardar receta»` en `apps/api/lib/__tests__/anthropic.test.ts`. Cubre un caso por idioma.
- P1 RED, con el prompt sin cambios: fallan los 3 casos por la razón esperada. El prompt no nombra «Ingredientes», «Ingredienti» ni «Ingredients» como títulos.
- P1 GREEN:
  - `anthropic.test.ts` 31/31; `tsc --noEmit` con salida 0.
  - Suite de la API: 1172 tests pasan y 8 se omiten. Falla un archivo, `app/api/restaurant/leave/__tests__/leave.test.ts`, por *timeout* del `beforeAll` bajo carga. Aislado pasa 8/8, la rama no lo toca y ya figuraba en la auditoría del 6-10-2026.

## Siguiente paso
- P2: proponer los casos de la prueba y pedir la aprobación de Andy.
