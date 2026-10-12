# Tuteo en el diccionario español

- **Rama:** `fix/registro-tuteo` (sale de `main` c7aa8cf), worktree `.claude/worktrees/registro-tuteo`
- **Origen:** pedido del 07-10-2026. El 12-10-2026 Andy eligió el tuteo para toda la app («tuteo, arráncalo»).
- **Espejo en Engram:** `odd/registro-tuteo/tasks`

## Objetivo
Que todos los textos en español traten al usuario de tú.

## Problema
`packages/i18n/src/es.ts` mezcla voseo rioplatense («Escribí o dictá…», «Anotá ideas sueltas y trabajalas con el Asistente…») con tuteo («Anota la primera idea y empieza.», «Puedes continuar con Diario.»). El chef lee dos registros distintos en la misma app.

## Por qué
El mercado hispanohablante puede ser España, donde el voseo suena ajeno. La landing en español ya usa el tuteo (`apps/api/components/pilot-landing.tsx:70, 94, 102`).

## Decisiones
- Tuteo en toda la app (Andy, 12-10-2026).
- Solo cambia el tratamiento: vos → tú y usted → tú. Se conservan las claves, el significado, las variables de interpolación y el vocabulario.
- `chat_greet` («Buongiorno, Chef.») no cambia hasta que Andy confirme si el saludo en italiano es de marca.
- `memory_unavailable` y `memory_identity_hint` usan vosotros («vuestra cocina», «os gustaría»), que es el plural del tú en España. No son vos ni usted, así que quedan igual.
- `delete_account_typing_hint` pasa a «tipea» y conserva el verbo, aunque en España sería más común «escribe»: la regla es no cambiar el vocabulario.

## Alcance autorizado
`packages/i18n/src/es.ts` y los tests que comprueban sus textos. Además, los dos comentarios de `apps/mobile/src/components/ProfileSheet.tsx` (líneas 72 y 555) que citaban el botón «Hacete Pro», para que no queden desactualizados. Fuera de alcance: `it.ts`, `en.ts`, `chat_greet` y los demás restos en italiano de `es.ts` (Engram `atelier/bug-es-ts-restos-italiano`).

## Restricciones
- TDD estricto (fuente: `~/.claude/CLAUDE.md`). Runner: `vitest run` (`pnpm -C packages/i18n test`, `pnpm -C apps/mobile test`).
- Conventional Commits sin atribución de IA.
- Entrega: `ask-on-risk` (por defecto). Previsión: unas 150 líneas en un solo PR.

## Tareas
- [x] T1 — `es.ts` en tuteo, con su test. Ruta: delegada, un escritor (Opus). Disparadores: escritura en dos archivos no triviales (`es.ts` y el test) y lectura de preparación de `es.ts` entero.

## Criterios de aceptación
- Ningún texto de `es.ts` trata al usuario de vos ni de usted.
- Cada texto cambiado conserva su clave, su significado y sus variables.
- `it.ts`, `en.ts` y `chat_greet` quedan igual.

## Comprobaciones
- `pnpm -C packages/i18n test`, `pnpm -C packages/i18n typecheck`
- `pnpm -C apps/mobile test`, `pnpm -C apps/mobile typecheck`

## Progreso y evidencia
- Línea base (c7aa8cf): i18n, 1 archivo y 41 tests; móvil, 47 archivos y 459 tests.
- Auditoría: 46 textos en voseo y ninguno en usted. Ningún test ni snapshot comprobaba los textos viejos: los tests del móvil comprueban claves, no el texto en español.
- Test nuevo: bloque «Spanish copy addresses the user as tú» en `packages/i18n/src/index.test.ts`. Comprueba el texto exacto de las 46 claves y que `chat_greet` no cambia.
- RED, observado por el supervisor con `es.ts` sin cambios: en i18n fallan 46 y pasan 42 (88), todos por diferencia de texto. Por ejemplo, `section_explainer_inicio` todavía decía «Anotá … trabajalas».
- GREEN, repetido por el supervisor: i18n 88/88 y typecheck sin errores; móvil 47 archivos y 459/459, typecheck sin errores.
- Diff: `es.ts` cambia 46 líneas, una por clave. Un script del escritor confirmó que nada cambia fuera de esos 46 valores: ni claves, ni comentarios, ni los saltos de línea CRLF. En `ProfileSheet.tsx` solo cambian los dos comentarios.
- Barrido del supervisor en `es.ts`: no quedan «vos», «sos» ni verbos en voseo con tilde final. Los imperativos con pronombre llevan la tilde del tuteo (Actívalo, trabájalas, Pídele).
- Commit de T1: `1269616` (216 líneas). RDD sobre `1269616` (base `c7aa8cf`): riesgo medio por `executable_change` en `ProfileSheet.tsx`, aunque solo cambian comentarios. `review_due: false` por `under_budget`.

## Siguiente paso
- Preflight de RDD al cerrar. Después, el PR a `main`, que decide Andy.
- Pendiente de Andy: si «Buongiorno, Chef.» es de marca.
- Seguimiento, fuera de alcance:
  - Voseo fuera de `es.ts`: las páginas web de privacidad, términos y borrar cuenta (`apps/api/app`) y textos que se envían a la IA. Está propuesto como tarea aparte.
  - Vocabulario regional en `es.ts`, que no es cuestión de tratamiento: «acá», «tipear», «agregar» junto a «añadir», «costo» junto a «coste», «sacar foto», «en promedio». Si el mercado es España, conviene revisarlo en otro pase.
