# Memoria incremental y resumen del chat — ideas de Engram

- **Rama:** `feat/memoria-incremental` (sale de `origin/main` f1cc565), worktree `.claude/worktrees/memoria-incremental`
- **Origen:** 12-10-2026. Se analizó qué copiar de la ingeniería de Engram (Engram: `atelier/memoria-ideas-engram-2026-10`) y Andy eligió «empecemos por la 1 y la 2».
- **Espejo en Engram:** `odd/memoria-incremental/tasks`

## Objetivo
1. **Aprendizaje incremental.** Que la memoria culinaria evolucione en lugar de regenerarse: el extractor ve las tendencias vigentes y las confirma, ajusta o descarta. Engram lo hace con su upsert por `topic_key`.
2. **Resumen del chat.** Que el asistente no olvide lo acordado en los chats largos: el tramo que sale de la ventana del historial se resume con una plantilla fija, como el resumen de sesión de Engram.

## Problema
- Cada corrida del extractor reescribe `learned` desde cero y no recibe los hechos previos (`provider.ts` `MemoryInput`; `worker.ts` sobrescribe todo). Una tendencia puede aparecer, desaparecer o cambiar de redacción de una semana a otra. Cada cambio de texto invalida la caché del bloque de memoria y la del hilo.
- La versión del prompt del extractor no forma parte de la huella que salta las corridas sin cambios: un prompt nuevo no vuelve a aprender hasta que cambien las recetas.
- Lo que sale de la ventana del historial (`stableHistoryWindow`, de 11 a 20 mensajes y hasta 40.000 caracteres) se pierde. No hay ningún resumen.

## Diseño
### T1 — Aprendizaje incremental
- El extractor recibe `currentTrends: [{key, text}]`: los hechos publicados que siguen siendo válidos (validación de evidencia actual), sin las claves corregidas ni las excluidas.
- Reglas nuevas del prompt:
  - si una tendencia vigente sigue respaldada por las recetas, se devuelve con el mismo texto exacto y sus fuentes actuales;
  - si cambió, se devuelve ajustada;
  - si ya no se sostiene, se omite.
  - Se mantienen las reglas actuales: puede haber tendencias nuevas, entre 0 y 4, como máximo una por clave y con al menos 2 recetas fuente.
- Al fusionar: si una tendencia devuelta tiene la misma clave que una vigente y su texto coincide tras normalizarlo (espacios, mayúsculas y punto final), se publica el texto vigente byte a byte. Así el bloque de memoria no cambia y la caché sobrevive.
- La huella de las corridas sin cambios incluye la versión del prompt (`MEMORY_PROMPT_VERSION`, que se incrementa). Un prompt nuevo provoca una sola corrida de reaprendizaje, sujeta al límite semanal. No debe invalidar `preparedContext` si el texto publicado no cambia.
- No se guarda un contador de confirmaciones: nada lo consumiría todavía.

### T2 — Resumen del tramo que sale de la ventana
- Un resumen continuo por conversación: cuando se completa un bloque de 10 mensajes, se resume en segundo plano (`after()`) a partir del resumen anterior y ese bloque. Usa una plantilla fija: decidido, descartado, pendiente y datos del plato.
- Se inyecta como dato en el bloque vivo y solo cuando cubre exactamente hasta el inicio de la ventana. Así cambia en el mismo turno en que la ventana avanza y no rompe la caché más que hoy.
- Si el resumen no está listo, el turno sigue sin él (degradación limpia). No aplica al modo vista previa.
- **D1 (Andy, 12-10-2026): resume el modelo del turno.** Gemini Flash en Diario y Claude Haiku 5.5 en Creativo. No crea ningún flujo de datos nuevo. Agregar Haiku toca la tarifa en `budget-policy.ts`, la configuración en `config.ts` y la variable de Vercel.
- **D2 (Andy, 12-10-2026): la ventana se mantiene en 11-20 mensajes y se mide.** El resumen solo agrega memoria. Achicar la ventana se decide después, con datos de chats largos.

## Alcance autorizado
- T1: `apps/api/lib/culinary-memory/**` y sus tests. Fuera de alcance: el móvil, el esquema y el prompt del chat.
- T2: se define tras D1 y D2. Previsto: el esquema (tabla de resúmenes), `apps/api/lib/ai/chat.ts`, `apps/api/lib/chat-turn-service.ts`, `apps/api/lib/anthropic.ts`, el texto de privacidad y sus tests.

## Restricciones
- TDD estricto (fuente: `~/.claude/CLAUDE.md`). Runner: `vitest run` (`pnpm -C apps/api test`).
- Conventional Commits sin atribución de IA.
- Entrega `ask-on-risk` con cadena **apilada a main**, elegida por Andy el 12-10-2026. Previsión: T1 entre 250 y 350 líneas y T2 entre 400 y 500. Tramos:
  - PR 1, T1: rama `feat/memoria-incremental`, que contiene `0dcd10f` y este documento, contra `main`.
  - PR 2, T2: rama `feat/resumen-chat`, que sale de la punta de PR 1. Se redirige a `main` cuando se fusione PR 1.
- Cambiar o agregar un modelo de IA toca tres sitios: `budget-policy.ts`, `config.ts` y la variable de Vercel.

## Tareas
- [x] T1 — aprendizaje incremental: hechos vigentes al extractor, texto estable y versión del prompt en la huella. Ruta: delegada, un escritor (Opus). Disparador: dos o más archivos no triviales (`provider.ts`, `worker.ts` y la huella, más los tests).
- [x] T1b — hallazgo R3-legacy-hash-bypass, no bloqueante: si una memoria con huella anterior termina en la salida temprana (menos de 2 fuentes o todas las categorías excluidas), nunca reescribe la huella con prefijo. Por eso evita el atajo diario y vuelve a cargar evidencia cada día. Andy pidió hacerla el 12-10-2026. Ruta: inline, porque es un cambio de una sola condición en `worker.ts` más su test. Va en el PR 1, que es donde nació el problema.
- [x] T2 — resumen del chat: el modelo del turno y la ventana sin cambios. Va en su propia rama y PR, después de T1. Ruta: delegada, un escritor (Opus). Disparador: dos o más archivos no triviales (esquema, módulo nuevo, servicio del turno y ruta).
- [ ] T3 — entrega: PR de T1 y, después, de T2.

## Criterios de aceptación (T1)
- El payload del extractor incluye las tendencias vigentes (clave y texto), sin las claves corregidas ni excluidas y sin los hechos inválidos.
- Si el modelo devuelve el mismo rasgo con diferencias cosméticas, el texto guardado es idéntico al anterior y el contexto renderizado no cambia.
- Si el modelo omite una tendencia vigente, esa tendencia desaparece.
- Un cambio de versión del prompt provoca una corrida aunque las recetas no hayan cambiado. Una entrada sin cambios y con la misma versión se sigue saltando.
- Se conservan las garantías actuales: al menos 2 fuentes, como máximo 4 tendencias, las claves corregidas o excluidas se descartan, y si el modelo propuso tendencias pero ninguna sobrevive se conserva la memoria anterior.

## Comprobaciones
- `pnpm -C apps/api test`
- `pnpm -C apps/api typecheck`

## Progreso y evidencia
- 12-10-2026: worktree creado y dependencias instaladas. Base: 105 archivos y 1325 tests en verde, `tsc` 0. La primera corrida en frío tuvo 2 timeouts de hooks que no se repitieron.
- T1, delegada a un escritor Opus:
  - Cambios en `provider.ts`:
    - `currentTrends` en el payload;
    - la regla de confirmar, ajustar u omitir en el prompt;
    - «una tendencia vigente no es una fuente».
  - Cambios en `limits.ts`: `MEMORY_PROMPT_VERSION` pasa a `2026-10-12.1`.
  - Cambios en `worker.ts`:
    - `learnedInputHash`, de forma `"<versión>:<evidenceHash>"`;
    - el atajo `checkedRevision === dirtyRevision` se salta si la huella es de un prompt anterior;
    - el texto confirmado se publica byte a byte;
    - el orden publicado es estable.
  - Tests: `worker.a9.test.ts`, `provider.test.ts` y `provider.a9b.test.ts`.
  - RED: 11 fallan y 53 pasan, por aserciones sobre la conducta que falta.
  - GREEN: 105 archivos y 1338 tests (13 nuevos); typecheck 0. El supervisor repitió las dos comprobaciones con el mismo resultado.
  - Decisiones interpretadas que se aceptan:
    - orden estable: las vigentes conservan su orden y las nuevas van al final;
    - la validez de las tendencias vigentes se mide contra la evidencia seleccionada en la corrida (hasta 20 recetas).
  - Efectos conocidos tras el despliegue:
    - Cada memoria elegible hace una corrida pagada en la semana siguiente.
    - Esa corrida sube `version`, así que un teléfono con el `expectedVersion` anterior recibe un conflicto, como tras cualquier publicación.
    - Una memoria con huella antigua y menos de 2 recetas vuelve a cargar evidencia en cada revisión diaria, sin llamada pagada, hasta que publique.
  - Commit `0dcd10f`, más el documento en `8b146db`. PR 1: https://github.com/andygomezgc-alt/atelier-2-0/pull/44.
  - RDD: riesgo medio, 288 líneas, con consentimiento de Andy. La revisión `review-d71d4e4dde9415d2` (lente de fiabilidad) quedó **aprobada con acuse de recibo** y la autoridad consumida. Dejó un aviso no bloqueante, R3-legacy-hash-bypass, que pasa a la tarea T1b.
- T1b, en la rama `fix/memoria-huella-legacy`, que sale de `cad4c69`:
  - En la salida temprana, si la huella es de un prompt anterior, se reescribe con la versión actual. Es seguro porque la `PATCH` de correcciones y exclusiones sube `dirtyRevision` (`service.ts:62`).
  - El caso de fallo de generación no cambia: lo limitan la puerta semanal y la supresión de fallos, igual que a cualquier memoria que falla.
  - RED: 2 fallan y 48 pasan (`expected [false, false] to have a length of 1`), es decir, la evidencia se vuelve a leer.
  - GREEN: 105 archivos y 1340 tests; typecheck 0.
  - Commit `10bba84`, subido a `feat/memoria-incremental` (PR 1).
  - RDD assess desde `8b146db`, el último límite revisado: riesgo medio, 35 líneas, `under_budget`, así que queda pendiente dentro del tramo.
- T2, delegada a un escritor Opus, commit `3d91b13` en `feat/resumen-chat` y reapilada sobre `10bba84`:
  - Cambios:
    - `ConversationSummary`, con clave `(conversationId, through)`, borrado en cascada y migración `20261012200000_conversation_summaries` generada sin base de datos.
    - `apps/api/lib/chat-summary.ts`:
      - `nextSummaryThrough = ceil(max(0, n+1−20)/10)·10`, probado contra `stableHistoryWindow` entre 0 y 55 mensajes;
      - el tope de 1200 caracteres;
      - `loadChatSummary` y `refreshChatSummary`, que nunca lanza error;
      - las llamadas a Gemini y Haiku.
    - La tarea `chatSummary` (`claude-haiku-5-5`, `AI_CHAT_SUMMARY_MODEL`) y la tarifa de Haiku.
    - En `anthropic.ts`, la clave `earlierMessagesSummary` al final del bloque vivo.
    - En `chat-turn-service.ts`, la lectura en el inicio absoluto de la ventana.
    - En la ruta de mensajes, la actualización dentro del `after(completion)` existente, después de `done`.
    - Una frase nueva en la página de privacidad.
  - Presupuesto: sigue el patrón de `glm.ts` (`reserveGeneration`, luego `settleGeneration` o `releaseGeneration`). No consume `AiChatQuota`.
  - RED: 33 fallan y 188 pasan en 5 archivos, todas con `AssertionError`.
  - GREEN del escritor: 106 archivos y 1381 tests; typecheck 0; `prisma validate` válido, con un `DATABASE_URL` de relleno y sin conexión.
  - Supervisor, tras reapilar sobre T1b: 1383 tests y typecheck 0.
  - Huecos aceptados:
    - Si el chef responde mientras se genera el resumen (2-5 s), ese turno sale sin él y el siguiente pierde la caché una vez.
    - Si el tope de 40.000 caracteres adelanta el inicio de la ventana, queda un tramo sin cubrir hasta el siguiente resumen.
    - Una conversación sin resumen previo se resume a partir de hasta 40 mensajes.
    - Los encabezados del resumen van fijos en español.
  - Despliegue: la migración se aplica sola con el build de Vercel (`db:migrate:deploy`). No hace falta ninguna variable nueva mientras se use el modelo por defecto.
  - Tamaño: 726 líneas añadidas y 9 borradas, de las cuales unas 445 son tests.
    - Se hizo una sola pasada de corte. Separar la escritura del resumen de su lectura deja la mitad del módulo y sus tests por encima de 400 (`chat-summary.ts` y su test suman 516) y entrega código muerto hasta la segunda mitad.
    - Se mantiene un solo PR 2 y se recomienda `size:exception`.
