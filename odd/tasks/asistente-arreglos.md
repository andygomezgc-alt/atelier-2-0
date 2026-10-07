# Arreglos del Asistente — auditoría de arquitectura (oct 2026)

- **Rama:** `codex/asistente-arreglos` (sale de `main` c646c86). Worktree: `.claude/worktrees/asistente-arreglos`.
- **Espejo Engram:** `odd/asistente-arreglos/tasks`
- **Origen:** auditoría del 06-10-2026 (Engram `atelier/auditoria-asistente-2026-10`). Andy pidió hacer todos los arreglos sugeridos salvo el hallazgo 7 (presupuesto drenable por cuentas nuevas): el piloto es cerrado y se resolverá antes de publicar.

## Objetivo
Que el asistente no pierda respuestas ni presupuesto, diga la verdad cuando algo falla, respete los permisos y quede más fácil de mantener.

## Problema (verificado en el código)
- Las reservas de presupuesto no se liberan cuando la generación no termina bien (desconexión, timeout, 429/5xx del proveedor, bloqueo de Gemini). Cada reserva vale unas 10 veces el coste real y nada las reconcilia.
- El banner de error del chat dice «Sin conexión… se sincronizará» ante cualquier fallo. El servidor manda los errores sin código y algunos llegan en crudo.
- El chat sin restaurante pierde el contexto cuando el restaurante se crea desde Inicio.
- El Lector puede listar y leer todos los chats del restaurante.
- El rechazo por cuota llega tras un 200 y con el mensaje del chef ya guardado.
- Guardar una receta durante un aprendizaje descarta el resultado pagado y lo aplaza 7 días.
- La respuesta depende de que la conexión siga abierta; no hay botón Detener.
- Menores: texto del restaurante sin marcar como datos en el prompt, listas numeradas que reinician en 1, pantalla redibujada ~30 veces por segundo al recibir la respuesta, coste por mensaje no calculable, errores del chat fuera de Sentry.

## Decisiones
- Implementa Codex con `gpt-6.1-sol`: esfuerzo `high`, y `xhigh` en las tareas complejas (pedido de Andy). El padre escribe la especificación, verifica de forma independiente, commitea y corre la revisión RDD.
- Runtime de Codex: el CLI global (0.144.4) rechaza `gpt-6.1-sol` con cuenta ChatGPT. Se usa el runtime 0.160.1 de la app de escritorio (`%LOCALAPPDATA%/OpenAI/Codex/bin/5ea220ae823df3d7`), antepuesto al PATH del companion. No se toca `~/.codex/config.toml`.
- Detener sin migración: detener libera el `generationId` de la conversación; la generación en curso lo detecta en el latido y corta.
- Migraciones: SQL generado con `prisma migrate diff` contra HEAD; no se aplica a ninguna base remota sin permiso explícito. Producción la aplica el build de Vercel al fusionar.
- Fuera de alcance: hallazgo 7; idioma de la memoria (requiere decidir quién fija el idioma del restaurante); TTL de 1 h de la caché (medir antes).

## Alcance autorizado
A1–A13. Commits por tarea en esta rama; push al cerrar (regla permanente de Andy). PR y merge los decide Andy.

## Restricciones
- TDD estricto: activado (fuente `~/.claude/CLAUDE.md`), runner `vitest run` (api, mobile, shared).
- RDD: activado (global). Evaluación de riesgo tras cada commit de tarea.
- Textos en es/en/it. Commits convencionales sin Co-Authored-By.

## Tareas
| ID | Tarea | Ruta | Motivo de la ruta |
|---|---|---|---|
| A1 | El Lector no lee chats (GET con `capture_idea`, pestaña oculta) | Codex high | API + móvil, acotado |
| A2 | Contrato de errores: códigos cerrados en SSE, adaptadores normalizados, i18n, mapeo móvil | Codex xhigh | Varias capas y proveedores |
| A3 | Errores honestos en el móvil: banner, toast de error, reintento solo si sirve, 401, ids codificados | Codex high | UI acotada sobre A2 |
| A4 | Reservas: liberar si no hubo generación, liquidar con uso conocido, script de reconciliación | Codex xhigh | Dinero y concurrencia |
| A5 | Servicio de turno: reservar antes de guardar el mensaje, rechazos como HTTP real, preview alineado | Codex xhigh | Refactor de la ruta más crítica |
| A6 | La respuesta sobrevive a la desconexión; Detener en el servidor | Codex xhigh | Ciclo de vida serverless |
| A7 | Observabilidad: `generationId` y escrituras de caché en Message, evento `ai_turn` por logger | Codex high | Migración aditiva |
| A8 | Datos del restaurante marcados como datos en el prompt; notas normalizadas | Codex high | Prompt y caché |
| A9 | Worker de memoria: corridas descartadas, PATCH sin reescritura, holgura del cron, env inválido, reintentos | Codex xhigh | Concurrencia con triggers |
| A10 | Chat sin restaurante conserva el contexto; error visible al guardar receta; bulk endurecido | Codex xhigh | Móvil + API |
| A11 | Listas numeradas en el markdown del chat | Codex high | Parser acotado |
| A12 | Pantalla del asistente en hooks con estado explícito; burbuja aislada; accesibilidad | Codex xhigh | Refactor grande |
| A13 | Detener y reanudar en el móvil | Codex xhigh | Depende de A6 y A12 |

Orden: A1 → A2 → … → A13 (secuencial: varias tareas tocan la ruta del chat y la pantalla).

- [x] A1 — Lector sin acceso a los chats
- [x] A2 — contrato de errores
- [x] A3 — errores honestos en el móvil
- [x] A4 — reservas de presupuesto
- [x] A5 — servicio de turno
- [x] A6 — respuesta que sobrevive y Detener (servidor)
- [x] A7 — observabilidad
- [ ] A8 — datos del restaurante en el prompt
- [ ] A9 — worker de memoria
- [ ] A10 — chat sin restaurante
- [ ] A11 — listas numeradas
- [ ] A12 — pantalla en hooks
- [ ] A13 — Detener y reanudar (móvil)

## Criterios de aceptación
- A1: el Lector con restaurante recibe 403 en el listado y en los mensajes; sous-chef 200. La pestaña Asistente se oculta al Lector con restaurante y sigue visible sin restaurante.
- A2: todo evento SSE `error` lleva `code` de un conjunto cerrado; errores de Anthropic, Gemini, timeout, rechazo y presupuesto se traducen; nada crudo llega al cliente; los códigos nuevos están en shared, i18n y el mapeo móvil.
- A3: el banner muestra el motivo real; Reintentar solo cuando reintentar puede funcionar; toast de error con nivel error; 401 cierra sesión; nunca se muestra `err.message` en crudo.
- A4: un fallo sin tokens generados libera la reserva entera; un bloqueo o corte con uso conocido liquida ese uso; el script lista y liquida reservas viejas (modo prueba por defecto).
- A5: cuota o presupuesto agotado devuelve 429/503 con `Retry-After` antes del stream y sin guardar el mensaje; la ruta queda delgada.
- A6: cerrar la app no corta la generación: la respuesta se guarda y se recupera con el mismo `clientMessageId`; Detener corta la generación en curso y libera el turno.
- A7: cada mensaje del asistente enlaza su `AiGeneration`; el coste por mensaje se puede calcular; los errores del chat llegan a Sentry.
- A8: identidad, notas, títulos e idea anclada van como datos delimitados con una línea de precedencia; las notas sin saltos de línea; el prompt sigue siendo idéntico byte a byte entre turnos.
- A9: guardar una receta durante un aprendizaje no descarta el resultado si las fuentes no cambiaron; una corrida descartada no consume la ventana semanal; un env de modelo inválido no rompe la hoja de memoria.
- A10: al crear el restaurante desde Inicio, el siguiente mensaje sube el historial local antes de seguir; el fallo al guardar receta se ve; el bulk conserva el orden.
- A11: «1.», «2.», «3.» se respetan con líneas en blanco o viñetas anidadas entre medio.
- A12: la pantalla queda partida en hooks con un reducer; solo la burbuja que recibe texto se redibuja; etiquetas de accesibilidad traducidas.
- A13: botón Detener visible mientras llega la respuesta; al volver del segundo plano se recupera la respuesta guardada.

## Comprobaciones
- `pnpm --filter api typecheck`, `pnpm --filter api exec vitest run --hookTimeout=30000`
- `pnpm --filter mobile test`, `npx tsc --noEmit` en apps/mobile (ignorar solo TS5101 de baseUrl)
- `pnpm --filter @atelier/shared test` y `npx tsc --noEmit` en packages/shared e i18n cuando se tocan
- Si se toca el móvil: `npx expo export --platform android` (borrar `dist`)

## Entrega
- Previsión: unas 3400 líneas con tests, muy por encima de 400. Estrategia `ask-on-risk` → Andy eligió (06-10) **tres PR encadenados a main** (`stacked-to-main`), fusionados en orden. Cada corte supera 400 líneas (sobre todo tests): excepción de tamaño aceptada por Andy al elegir los tres cortes.
- Cortes (un commit por tarea):
  1. PR 1 — servidor: A1–A7.
  2. PR 2 — prompt y memoria: A8–A9 (apila sobre PR 1).
  3. PR 3 — móvil: A10–A13 (apila sobre PR 2).

## Progreso y evidencia
- Línea base del worktree (06-10, c646c86): api tsc OK y 794/794; mobile tsc OK y 186/186; shared tsc OK y 261/261; i18n tsc OK.
- **Entorno de Codex:** su sandbox no puede correr vitest (esbuild sube hasta `C:/Users/Utente`, que el usuario del sandbox no puede listar). Codex escribe tests y código y corre `tsc`; el padre corre vitest fuera del sandbox y le pasa RED/GREEN. Cada tarea va en dos pasos: tests primero, luego producción.
- **A1** (Codex gpt-6.1-sol high; ruta delegada: escritor en 2+ archivos no triviales, pedido explícito de Andy).
  - Cambios: `capture_idea` en `GET /api/conversations` y `GET /api/conversations/[id]/messages`; la auditoría encontró la conversación por idea y el bulk ya protegidos. Regla `canShowAssistantTab` (oculta el chat solo a quien tiene restaurante y no tiene `capture_idea`) aplicada a la pestaña y a las tarjetas de idea de Inicio, que llevaban al chat oculto. Los mocks de `requireAuth` ahora respetan el permiso igual que el guard real.
  - RED (observado por el padre): api 2 fallos por la razón correcta (200 en vez de 403 para el Lector); móvil 2 fallos de visibilidad y 2 de Inicio (etiqueta visible y navegación). Dos tests fallaban por mocks rotos (`Tabs` como string, serialización circular) y se corrigieron antes de implementar.
  - GREEN: api 801/801 y tsc OK; móvil 195/195, tsc OK y `expo export --platform android` OK; `git diff --check` OK.
  - Commit `1b8e759`. RDD: riesgo medio, `review_due: false` (`under_budget`, 375 líneas); queda pendiente dentro del corte desde c646c86.
- **A2** (Codex gpt-6.1-sol xhigh). Paso 1 (tests) hecho: ~440 líneas en chat.test.ts, messages.test.ts, conversations/api-error del móvil, shared e i18n; compilan (los cuatro tsc OK).
  - RED observado por el padre: api 65 fallos / 63 pasan; móvil 5 / 24; shared 2 / 6; i18n 1 / 5. Todos por la razón correcta (faltan `code`, la tabla de reintento y las claves `error_<code>`).
  - Codex se quedó sin cuota de ChatGPT al cerrar el paso 1 («try again at 9:20 PM»). Andy decidió (06-10): seguir con un agente Opus 5.5 mientras Codex no tenga cuota y volver a Codex a partir de las 21:20. El paso 2 (producción) lo hace Opus sobre los tests de Codex.
  - Paso 2 (Opus 5.5, ruta delegada: escritor en 2+ archivos). `ChatError` con código cerrado en el adaptador (clases tipadas del SDK de Anthropic, estados HTTP y `finishReason` de Gemini, plazo propio separado del corte del cliente); evento SSE `{type:"error", code, message, retryAfter?}` con `message` traducido al idioma del usuario; `isRetryableChatError` en shared; claves `error_<code>` en es/en/it (las sueltas `ai_provider_failed` y `chat_response_incomplete` pasan a `error_*`); el móvil lee `code` y `retryAfter`. Se quitó `extractFriendlyError`. Un test viejo esperaba el error crudo `connection_lost` y ahora espera `ai_provider_failed` (lo exige la especificación).
  - Aceptado: los fallos de configuración del proveedor dejan dos registros de error (el adaptador con el detalle y la ruta con el código); son raros y los tests piden ambos.
  - GREEN verificado por el padre: api 864/864 y tsc OK; móvil 201/201, tsc OK y `expo export` Android OK; shared 263/263 y tsc OK; i18n 6/6 y tsc OK; `git diff --check` OK.
  - Commit `3c4fbc4`. RDD sobre c646c86..3c4fbc4 (A1+A2, 23 archivos, 1111 líneas): `slice_budget_reached`, riesgo medio; Andy concedió la revisión (`granted`). Lente de fiabilidad: **aprobada**, acuse hecho (`review-b45885fd242eee2d`, autoridad quemada). Frontera revisada: `3c4fbc4`.
  - Sugerencia no bloqueante de la revisión: el test de configuración de modelo inválida (`messages.test.ts` ~500) no comprueba el 503 `ai_provider_unconfigured`. Se refuerza en A3.
- **A3** (Opus 5.5 por falta de cuota de Codex; ruta delegada: escritor en 2+ archivos).
  - Cambios: `classifyChatError` (texto traducido, nunca `err.message`; reintento según `isRetryableChatError`; acciones `use_daily` para límite o rechazo del Creativo, `new_chat` para contexto largo y `sign_in` para 401). El banner del chat muestra ese motivo, ofrece Reintentar solo si sirve y se adapta al texto (sin los 200 px fijos); sin toast duplicado. Chat abierto con la pregunta sin respuesta: «La última pregunta quedó sin respuesta.» El 401 del stream cierra sesión como `apiFetch` (`notifyUnauthorized`). Ids con `encodeURIComponent`. Los toasts de error restantes usan el nivel error. El fallo al cargar el historial ya no dice «guardado localmente». Test de configuración de modelo inválida reforzado (503 `ai_provider_unconfigured`).
  - RED (del escritor): 11 fallos / 34 y el clasificador sin cargar (módulo inexistente); i18n 1 / 6. Todos por la razón correcta.
  - GREEN verificado por el padre: móvil 240/240, tsc OK y `expo export` Android OK; api 864/864 y tsc OK; i18n 7/7 y tsc OK; shared tsc OK; `git diff --check` OK.
  - Commit `c700242`. RDD sobre 3c4fbc4..c700242 (14 archivos, 521 líneas, riesgo medio): Andy concedió; lente de fiabilidad **aprobada**, acuse hecho (`review-561771fd82658802`). Frontera revisada: `c700242`.
  - Avisos no bloqueantes → tarea de seguimiento **A3b**: un 401 del stream cierra la sesión dos veces (el transporte y la acción «Volver a entrar» del banner llaman a `notifyUnauthorized`) y falta el test del 401 sin token.
- **A3b** (Opus). El transporte es el único que cierra la sesión; el 401 queda sin acción; se quita `chat_sign_in`. RED móvil 2 / 69 e i18n 1 / 7; GREEN móvil 241/241 e i18n 8/8 (verificado por el padre, con tsc y `expo export`). Commit `2e07a4b`; RDD `under_budget` (54 líneas), pendiente en el corte.
- **A4** (Opus, ruta delegada).
  - Cierre de reservas según lo que el proveedor factura: uso final exacto → `settled`; error HTTP antes de cualquier evento (o corte antes de llamar al proveedor) → `released` sin cargo; stream empezado y cortado → `interrupted` con la entrada exacta y la salida al techo; sin información (corte de red sin respuesta, timeout o abort antes de responder) → se mantiene la reserva. Contabilidad única `closeGeneration`, idempotente y bajo el bloqueo de fila.
  - Script `apps/api/scripts/reconcile-ai-holds.ts` (prueba por defecto, `--apply`): reservas de más de 30 min pasan a `expired` con el máximo coste `settled` del modelo en 30 días (tope: la reserva). Lógica pura en `budget-reconcile.ts`. No se corrió contra ninguna base.
  - Revisión del padre: al principio una caída de red sin respuesta liberaba la reserva; se corrigió para mantenerla (la petición pudo llegar al proveedor; nunca subcontar).
  - Tests de A2 cambiados a la nueva regla (bloqueo/error de Gemini con uso parcial → `interrupted`; errores HTTP → `released`). RED 48 / 46 y luego 2 / 72; GREEN api 889/889 y tsc OK (verificado por el padre); `git diff --check` OK.
  - Commit `50f7177`. RDD sobre c700242..50f7177 (A3b+A4, 17 archivos, 574 líneas, riesgo medio): Andy concedió; lente de fiabilidad **aprobada**, acuse hecho (`review-ad71f47fef375294`). Frontera revisada: `50f7177`.
  - Avisos no bloqueantes → seguimiento **A4b**: un 401 del stream sin token deja el banner «sesión expirada» sin salida (el transporte solo cierra sesión con token); el script de reconciliación no tiene test de su cableado con Prisma (dry-run/apply, `_max` nulo, contadores y código de salida).
- Codex vuelve a tener cuota (22:50); según lo decidido por Andy, las tareas siguientes vuelven a Codex gpt-6.1-sol.
- **A4b** (Codex gpt-6.1-sol high, dos pasos). El stream cierra la sesión ante cualquier 401 (con o sin token), una sola vez; `apiFetch` sin cambios. El script de reconciliación pasa a `reconcile-ai-holds-runner.ts` con dependencias inyectadas y 7 tests de cableado (dry-run, apply, `_max` nulo, omitidas vs fallidas, código de salida). RED observado por el padre: móvil 3 / 47, api 7 (stub). GREEN: api 896/896 y tsc OK; móvil 245/245, tsc OK y `expo export` OK; `git diff --check` OK.
- **A5** (Codex gpt-6.1-sol xhigh, dos pasos). Servicio `lib/chat-turn-service.ts` (prepare/run); la ruta queda en ~100 líneas. Orden: bloqueo → repetición → contexto y prompt → reserva con el techo del payload real → guardar el mensaje → stream. Cuota o presupuesto agotado devuelve 429/503 con `Retry-After` antes del stream y sin guardar el mensaje; un fallo de contexto solo suelta el bloqueo; uno posterior a la reserva la libera. `streamChat` consume la reserva preparada. Preview: ventana alineada por bloques y Creativo prohibido (403) sin restaurante.
  - Revisión del padre: la primera versión reservaba antes de cargar el contexto con un techo fijo de 600 000 tokens (~€4 por reserva del Creativo); se corrigió con tests nuevos al techo del payload real.
  - RED observado por el padre: 42 / 124 y luego 12 fallos del reordenamiento; GREEN api 937/937 y tsc OK; móvil 245/245; `git diff --check` OK. Nota: la sesión anterior se cortó con Codex a mitad de A5; un trabajo zombi del companion se marcó cancelado a mano.
  - Commit `205db46`. RDD sobre 50f7177..205db46 (A4b+A5, 13 archivos, 1491 líneas, riesgo medio): Andy concedió; lente de fiabilidad **aprobada**, acuse hecho (`review-bec93d03902a5003`). Frontera revisada: `205db46`.
  - Avisos no bloqueantes, se resuelven en **A6** (que rehace el manejo de cortes): los chequeos de desconexión dentro de `prepareChatTurn` no tienen tests, y un corte justo después de guardar el mensaje relanza el AbortError por la ruta en vez de cerrar limpio; el preview ya no recorta `history` a 20 antes de calcular el techo de la reserva (solo la infla).
- **A6** (Codex gpt-6.1-sol xhigh, dos pasos). La generación es una promesa propia registrada con `after()`: una desconexión solo deja de escribir en el SSE; la respuesta se guarda y la facturación se cierra igual. Plazo desde el inicio del pedido (`maxDuration` − 15 s = 285 s) y arriendo viejo a los 330 s (antes 10 min). `POST /api/conversations/[id]/messages/stop` (capture_idea, mismo restaurante, autor o admin, idempotente) libera el `generationId`; la generación lo comprueba en cada latido y antes de guardar, corta el proveedor, no guarda y emite `{type:"stopped"}`. La preparación ya no deja escapar AbortError. Preview: historial acotado a 20 entradas antes de la ventana. Turnos gestionados sin uso conocido se cierran al techo de la reserva (nunca subcontar) en vez de quedar retenidos.
  - RED observado por el padre: 68 / 67 (dos grupos fallaban por el arnés de tests y Codex los corrigió antes de implementar); un test de preview tenía un desfase de uno en el fixture y se corrigió. GREEN: api 975/975 y tsc OK; móvil 245/245; `git diff --check` OK.
  - Commit `2f689e8`. RDD sobre 205db46..2f689e8 (9 archivos, 890 líneas, riesgo medio): Andy concedió; lente de fiabilidad **aprobada**, acuse hecho (`review-0fcc99985d502834`). Frontera revisada: `2f689e8`.
  - Avisos → seguimiento **A6b**: el preview (sin persistencia ni Stop) ya no se corta al desconectarse y paga una respuesta que nadie recupera; una sola lectura fallida de la propiedad del turno aborta una generación pagada; falta probar que el cierre sin uso conocido cobra el techo de salida; la preparación convierte fallos reales en 499 sin registrarlos.
- **A6b** (Codex gpt-6.1-sol high, dos pasos). El preview vuelve a cortarse al desconectarse (no se puede recuperar ni detener) y cierra la facturación como en A4; el chat guardado sigue sobreviviendo. Una lectura fallida de la propiedad del turno solo deja un aviso y se reintenta en el siguiente latido (el plazo y el cercado atómico al guardar acotan el riesgo). Fallos reales de preparación con el cliente ya ido se registran y devuelven 503; el 499 queda solo para cortes puros. Test con el `settleInterruptedGeneration` real: el cierre sin uso cobra el techo de salida. RED observado por el padre 9 / 141; GREEN api 984/984 y tsc OK; `git diff --check` OK.
- **A7** (Codex gpt-6.1-sol high, dos pasos). Migración aditiva `20261007155532_message_generation_link` (`Message.generationId` con índice y `Message.cacheWriteTokens`, ambos nulos), generada con `prisma migrate diff` contra HEAD sin tocar ninguna base; producción la aplica el build de Vercel al fusionar. `finishChatTurn` guarda el id de la reserva y las escrituras de caché, así el coste por mensaje sale de `AiGeneration.chargedMicros`. Un único evento `ai_turn` por `logger` (conversación, restaurante, usuario, proveedor, modelo, resultado, generación, tokens, caché, tiempo al primer token, latencia; sin contenido); el rechazo del proveedor también va por `logger`. RED 19 / 984; GREEN api 1003/1003 y tsc OK; `git diff --check` OK.
  - Commit `dd779f7`. RDD sobre 2f689e8..dd779f7 (A6b+A7, 13 archivos, 519 líneas, riesgo medio): Andy concedió; lente de fiabilidad **aprobada**, acuse hecho (`review-3cdf20573c76ce14`). Frontera revisada: `dd779f7`. **Corte 1 (servidor, A1–A7) completo.**
  - Aviso → se corrige con A8: el test de la migración exige que sea la última carpeta (`directories.at(-1)`) y fallará con cualquier migración posterior; debe exigir solo que vaya después de las anteriores.
