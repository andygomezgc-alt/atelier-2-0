# Auditoría de bugs — Atelier 2.0

**Fecha:** 2026-07-17 · **Modo:** solo lectura (no se modificó código ni base de datos) · **Base:** commit `cececc9` (main con los fixes de la auditoría de seguridad ya mergeados) · **Alcance:** `apps/api`, `apps/mobile`, `packages/*`.

**Método:** 6 auditores en paralelo — 2× Opus (carreras de servidor; gestión de equipo/ciclo de vida), 3× Sonnet (errores silenciosos; estados y casos límite móvil; datos viejos y doble-tap) y Codex como segunda opinión independiente sobre el bloque crítico (código pasado inline). Cada hallazgo P1 fue verificado por el orquestador releyendo el código citado; los que no sobrevivieron la verificación se recalibraron o descartaron (se indica dónde). Censos: 198 bloques catch, 40 mutaciones móviles, 40 botones de acción, ~61 rutas API.

---

## Resumen para el chef (sin tecnicismos)

La app está **bien construida por dentro**: casi todas las operaciones que tocan varias tablas a la vez son atómicas (o salen bien o no pasa nada), las pantallas se refrescan correctamente después de crear/editar/borrar en el 92% de los casos, y el aislamiento entre restaurantes ya quedó validado en la auditoría de seguridad.

**No hay ningún P0 que ocurra con uso normal.** Pero hay **dos secuencias poco probables cuyo impacto sí sería de P0** (borrado total o restaurante irrecuperable), y las dos tienen arreglo barato — son lo primero de la lista:

1. **Salir del restaurante puede borrar TODO sin que nadie haya confirmado el borrado** (P1-1): si el último compañero sale mientras tú tienes abierta la hoja de "salir", tu "salir" se convierte en "borrar el restaurante entero" — recetas, menús, productos — sin pasar por la confirmación de escribir el nombre.
2. **Dos admins actuando a la vez pueden dejar el restaurante sin ningún admin** (P1-2): la protección de "último admin" que se añadió ayer funciona en secuencia, pero no bajo concurrencia real, y la vía de "salir del restaurante" quedó completamente fuera de esa protección. Sin admin, nadie puede invitar, cambiar roles ni administrar: hay que tocar la base de datos a mano.

Lo que el pilot **sí va a notar en el día a día** es el bloque de red móvil: con el wifi flojo de una cocina, hoy la app **te desloguea sola al arrancar** (P1-4), deja pantallas **girando para siempre** (P1-5), muestra **"no tienes recetas" cuando en realidad falló la conexión** (P1-7), y pierde el mensaje que le escribiste al Asistente si se corta la red a mitad (P1-8). Ninguno pierde datos del servidor, pero juntos hacen que la app parezca rota justo donde va a vivir: una cocina.

Y un clásico: el botón de **añadir un plato a la carta no se bloquea mientras trabaja** — dos toques rápidos = el plato aparece dos veces en el menú (P1-10).

---

## Respuestas directas a tus preguntas

1. **¿Errores silenciosos?** Censo completo: 198 catch en el código de producto; ~13 problemáticos. Los graves están en P1 (deslogueo al arrancar, login congelado en "Verificando…", listas que fingen estar vacías) y en P2 (ajustes de idioma/modelo que fallan sin avisar). Además, **Sentry está estructuralmente ciego** (P2-16): el servidor solo reporta errores *no* capturados — y casi todos se capturan — y el móvil no tiene Sentry en absoluto.
2. **¿Casos límite (vacío, null, offline, lento, cargas eternas)?** Los estados vacíos existen y los null están razonablemente controlados. Lo que falla es la rama de *error*: 3 P1 de red (P1-5, P1-6, P1-7). El cliente HTTP sí tiene timeout (30 s), pero la pantalla inicial lo espera en blanco (P1-4).
3. **¿Condiciones de carrera?** Servidor: la invariante de último admin no aguanta concurrencia y `leave` quedó fuera (P1-2); crear restaurante y otras escrituras multi-paso sin transacción (P2-2), colisiones de orden en cartas (P2-4/P2-5), webhook de Stripe sin idempotencia (P2-6), cron que pisa ediciones manuales (P2-9). Cliente: 1 botón que duplica de verdad (P1-10) y un grupo sin guard que solo genera requests/toasts duplicados (P2-14).
4. **¿Gestión de equipo a fondo?** Es el bloque con los hallazgos más serios (P1-1, P1-2, P1-3) y dos variantes aportadas por Codex (P2-3, y la carrera join‖borrado dentro de P1-1). A favor: el borrado del restaurante es transaccional y en orden topológico correcto, la expulsión no deja acceso residual a datos (el guard relee rol y restaurante de la DB en cada request), y borrar cuenta de usuario no existe como operación (una vía menos que romper).
5. **¿Pantallas con datos viejos?** El sistema de invalidación cruzada está **completo** donde más importa (menús↔recetas y productos↔recetas verificados mutación por mutación, 37/40 correctas). Quedan: renombrar el restaurante no actualiza el perfil ni el nombre del PDF exportado hasta reiniciar (P2-12), los cambios de rol hechos por otro admin no llegan a tu sesión hasta reiniciar (P2-13), y falta pull-to-refresh en Casa y las 3 papeleras (P2-18).

---

## P0 — Crítico con uso normal

**Ninguno.** No se encontró ninguna vía de pérdida o corrupción de datos con uso secuencial normal, ni crashes reproducibles en los flujos principales. Los dos hallazgos cuyo *impacto* sería P0 (borrado total no confirmado; restaurante sin admins) requieren una coincidencia temporal — están al tope de P1 y su arreglo es barato.

---

## P1 — Importante (arreglar antes de ampliar el pilot)

### P1-1 · Salir del restaurante puede ejecutar el borrado TOTAL sin la confirmación que el usuario vio
- **Qué es:** `POST /api/restaurant/leave` no recibe body: el servidor **recomputa** el caso (A=salir, B=traspasar admin, C=borrar todo) al momento de ejecutar, sin comprobar qué le mostró el preflight al usuario. La confirmación de "escribe el nombre del restaurante para borrar" es solo UI y el servidor nunca la verifica.
- **Dónde:** [leave/route.ts:20-27](apps/api/app/api/restaurant/leave/route.ts) (sin body, recompute) y [leave/route.ts:69-118](apps/api/app/api/restaurant/leave/route.ts) (caso C: 15 DELETEs); preflight en [leave/preflight/route.ts](apps/api/app/api/restaurant/leave/preflight/route.ts).
- **Escenario (simple):** quedan 2 personas. Tú abres la hoja de salir (el preflight te dice "sales y ya"). Mientras la tienes abierta, tu compañero sale por su cuenta. Tocas "Salir" → ahora eres el último → el servidor ejecuta el caso C y **borra recetas, menús, productos, conversaciones — todo** — y a ti te dice "has salido". Nadie escribió el nombre, nadie supo que era un borrado. Variante espejo (aporte Codex): alguien se une justo cuando el último sale — el `SetNull` lo desvincula en silencio y el restaurante se borra igual con él dentro.
- **Por qué P1 y no P0:** la ventana es corta (mientras la hoja está abierta) y requiere que dos personas actúen a la vez. Pero el impacto es pérdida total silenciosa, así que es **lo primero a arreglar del informe**.
- **Cómo se arregla:** el POST exige body `{ expectedCase }` (y para C, `{ confirmName }`); el servidor recomputa dentro de la transacción y si el caso difiere → 409 `case_changed` y la UI vuelve a preguntar. ~20 líneas.

### P1-2 · Invariante "último admin": sigue rota bajo concurrencia, y `leave` quedó completamente fuera
- **Qué es:** el fix de ayer (78326a8) mete el conteo de admins dentro de un `$transaction` — correcto en secuencia — pero **sin `isolationLevel: Serializable`**. En Postgres (READ COMMITTED por defecto) dos transacciones que degradan/expulsan a **dos admins distintos** cuentan `2` cada una, ninguna ve la escritura de la otra (filas distintas = cero conflicto), y ambas commitean → **0 admins**. Y `leave` ni siquiera tiene transacción: dos admins que salen a la vez ven cada uno al otro ("caso A") y salen los dos → restaurante **zombi**: con datos, con código de invitación vivo, sin miembros o sin ningún admin.
- **Dónde:** [staff/[userId]/route.ts:38-54](apps/api/app/api/restaurant/staff/[userId]/route.ts) (PATCH: count en L44-47 sin isolation) y [:88-103](apps/api/app/api/restaurant/staff/[userId]/route.ts) (DELETE, igual); [leave/route.ts:27-40](apps/api/app/api/restaurant/leave/route.ts) (caso A: `computeLeaveCase` y `update` sueltos, sin transacción); [lib/leave-cases.ts:21-47](apps/api/lib/leave-cases.ts).
- **Por qué es un riesgo (simple):** sin ningún admin, nadie puede invitar, cambiar roles, editar el restaurante ni ver el código (`permissions.ts:29-32`: todo eso es admin-only). El restaurante queda **irrecuperable desde la app** — solo se arregla tocando la base de datos a mano. Quien entre después con el código queda de viewer eterno.
- **Cómo se arregla:** (a) añadir `isolationLevel: "Serializable"` + retry en `P2034` a las dos transacciones de staff; (b) mover el caso A de `leave` dentro de una transacción igual (recomputar el caso dentro; si al recomputar sale C habiendo pedido A → 409, se enlaza con P1-1); (c) opcional pero recomendado por Codex: una invariante a nivel de datos (p. ej. constraint diferido o job de consistencia) para que "0 admins con miembros" no pueda persistir.
- *Nota:* Codex clasificó esta familia como P0; queda en P1 porque exige dos acciones concurrentes en la ventana de milisegundos-a-segundos. Mismo criterio de calibración que en la auditoría de seguridad.

### P1-3 · El expulsado puede volver a entrar con el código de invitación de siempre
- **Qué es:** expulsar solo hace `restaurantId = null`. El código de invitación **no rota, no caduca**, y además se muestra a **todos los roles** (la proyección del restaurante lo incluye y `GET /api/restaurant` no exige permiso). Cualquier ex-miembro que lo recuerde (o le hiciera captura a la pantalla de Casa) llama a `POST /join` y vuelve a entrar como viewer al instante: acceso de lectura a recetas, costes y precios.
- **Dónde:** [staff/[userId]/route.ts:99-102](apps/api/app/api/restaurant/staff/[userId]/route.ts) (expulsión sin rotación), [join/route.ts:52-67](apps/api/app/api/restaurant/join/route.ts) (sin comprobación extra), [lib/projections.ts:516](apps/api/lib/projections.ts) (código visible a cualquier miembro).
- **Cómo se arregla:** regenerar `inviteCode` dentro de la misma operación de expulsión (`generateInviteCode` ya existe); mostrar el código solo a quien tenga `manage_members`; opcional: caducidad.

### P1-4 · Arrancar la app con red mala **destruye la sesión** (y deja hasta 30 s de pantalla en blanco)
- **Qué es:** en el bootstrap, cualquier fallo de `fetchMe()` — timeout, sin red, un 500 de Vercel — cae en un catch-all que **borra el token guardado** y te manda a login, como si la sesión fuera inválida. Mientras tanto la pantalla raíz renderiza `null`: blanco total hasta 30 s. Un hipo del servidor desloguea a **todos** los usuarios que abran la app en ese momento.
- **Dónde:** [useAuth.ts:157-167](apps/mobile/src/hooks/useAuth.ts) (catch-all borra token; el patrón correcto ya existe 100 líneas arriba en `refreshMeImpl:47-58` y el 401 real ya tiene su vía correcta en L176-178) + [index.tsx:9](apps/mobile/app/index.tsx) (`if (loading) return null`).
- **Confirmado por dos auditores independientes.**
- **Cómo se arregla:** en ese catch, distinguir `ApiError` con `status===401` (→ desloguear) de `NetworkError`/otros (→ conservar token y mostrar "sin conexión, reintentando"); y renderizar un spinner en `index.tsx` en vez de `null`.

### P1-5 · Detalle de receta y de menú: spinner infinito si falla la carga
- **Qué es:** si el fetch del detalle falla, el catch solo lanza un toast fugaz y ningún estado de error queda guardado; la condición `if (loading || !recipe)` sigue siendo verdadera → `ActivityIndicator` **para siempre**, sin botón de reintento. La pantalla de producto ya lo resuelve bien — el patrón correcto está a 20 líneas.
- **Dónde:** [recetas/[id].tsx:58-61](apps/mobile/app/recetas/[id].tsx) + [:201](apps/mobile/app/recetas/[id].tsx); [menus/[id].tsx:381-384](apps/mobile/app/menus/[id].tsx) + [:839](apps/mobile/app/menus/[id].tsx). Patrón bueno: [productos/[id].tsx:380-397](apps/mobile/app/productos/[id].tsx).
- **Cómo se arregla:** replicar el patrón de productos (`loading && !data` para el spinner, rama `!data` con `NetworkError` + reintento).

### P1-6 · La tab Casa queda muerta tras un solo fallo de red (y muestra un código interno)
- **Qué es:** si el primer `GET /api/restaurant` falla, Casa muestra literalmente `network_unreachable` (string interno, documentado en el propio código como "no texto para humanos") sin botón de reintento; como las tabs no se remontan al navegar, queda así **el resto de la sesión**. Única salida: matar la app.
- **Dónde:** [useRestaurant.ts:38-41](apps/mobile/src/hooks/useRestaurant.ts); [casa.tsx:156-164](apps/mobile/app/(tabs)/casa.tsx). El componente `NetworkError` (icono + texto traducido + botón) ya existe y se usa en el Asistente.
- **Cómo se arregla:** usar `NetworkError` con `onRetry={reload}` en esa rama.

### P1-7 · Listas y sheets muestran "vacío" o datos viejos cuando en realidad falló la red
- **Qué es:** dos variantes. (a) Las tabs (Recetas, Menús, Inicio, Productos) tragan el error del reload en silencio y conservan lo anterior sin avisar que está desactualizado. (b) Peor: los bottom-sheets (añadir a menú, banco de recetas, chats anteriores) hacen `catch(() => setItems([]))` → pintan el **empty state normal** ("no hay menús todavía"), indistinguible de la realidad — el chef puede crear un menú duplicado convencido de que no existía.
- **Dónde:** (a) [recetas.tsx:77-90](apps/mobile/app/(tabs)/recetas.tsx), [menus.tsx:73-82](apps/mobile/app/(tabs)/menus.tsx), [inicio.tsx:51-63](apps/mobile/app/(tabs)/inicio.tsx), [productos/index.tsx:185-199](apps/mobile/app/productos/index.tsx); (b) [AddToMenuSheet.tsx:89](apps/mobile/src/components/AddToMenuSheet.tsx), [RecipeBankPickerSheet.tsx:48](apps/mobile/src/components/RecipeBankPickerSheet.tsx), [PreviousChatsSheet.tsx:51-58](apps/mobile/src/components/PreviousChatsSheet.tsx).
- **Confirmado por dos auditores independientes.**
- **Cómo se arregla:** estado `error` separado de "vacío" + `NetworkError` con reintento; prioridad a los sheets (variante b).

### P1-8 · Asistente: un corte real de red durante la respuesta pierde tu mensaje, sin reintento
- **Qué es:** solo el timeout de inactividad (35 s, ya conocido como A-05) muestra el banner de reintento que conserva el texto. Cualquier **otro** error del stream (corte de red real, error del server a mitad) cae a un toast técnico fugaz — y tu mensaje ya se borró del input: hay que recordarlo y reescribirlo.
- **Dónde:** [asistente.tsx:431-437](apps/mobile/app/(tabs)/asistente.tsx) (solo `StreamTimeoutError` va a `setStreamError`); [conversations.ts:211-223](apps/mobile/src/api/conversations.ts) (el resto llega como `Error` genérico).
- **Cómo se arregla:** tratar todo error de stream (salvo abort) con el mismo `setStreamError` que ya existe.

### P1-9 · Verificación de login: una promesa huérfana congela "Verificando…" para siempre
- **Qué es:** en la pantalla de verificación del magic-link, `signInWithToken(...)` se llama dentro del `.then()` **sin await ni catch propio** (el `.catch()` de la cadena no la cubre porque el callback no la retorna). Si `SecureStore.setItemAsync` falla — keychain ocupado/lleno, pasa en dispositivos reales — el rechazo queda huérfano: ni error, ni redirect, la pantalla se queda clavada en "Verificando…" hasta matar la app.
- **Dónde:** [verify.tsx:36-47](apps/mobile/app/(auth)/verify.tsx) (L38). El mismo hook se usa **bien** en [login.tsx:69](apps/mobile/app/(auth)/login.tsx) (`await` + try/catch).
- **Cómo se arregla:** `await signInWithToken(...)` dentro del mismo manejo de error que ya tiene la pantalla.

### P1-10 · Doble toque en "añadir a la carta" = plato duplicado en el menú
- **Qué es:** `addToSection` no tiene guard ni `disabled` (a diferencia de sus dos funciones hermanas en el mismo archivo, que sí lo tienen), y el sheet queda interactivo durante todo el round-trip. Dos toques en la fila de sección = dos `POST /items` = la receta aparece **dos veces** en la carta (el servidor no tiene unique que lo impida — ver P2-4).
- **Dónde:** [AddToMenuSheet.tsx:122-134](apps/mobile/src/components/AddToMenuSheet.tsx) (función) y [:283-302](apps/mobile/src/components/AddToMenuSheet.tsx) (Pressables sin `disabled`).
- **Cómo se arregla:** flag `adding` + `disabled={adding}`, patrón idéntico al `creating` de `createMenuAndAdvance` en el mismo archivo.

---

## P2 — Conviene arreglar (defensa, casos raros, fricción)

### Servidor

- **P2-1 · Receta aprobada: una edición concurrente esquiva el candado admin-only.** El gate lee `existing.state` fuera de la transacción ([recipes/[id]/route.ts:74](apps/api/app/api/recipes/[id]/route.ts) y [:93-106](apps/api/app/api/recipes/[id]/route.ts)) y escribe después ([:182-183](apps/api/app/api/recipes/[id]/route.ts)): si B aprueba entre la lectura de A y su escritura, el contenido de A (no-admin) entra en una receta ya aprobada. Es la versión "carrera" del P1-1 de seguridad que 7f16777 cerró en secuencial. Fix: re-verificar `state` dentro del `$transaction` (o `updateMany` condicional).
- **P2-2 · Crear restaurante no es transaccional.** `restaurant.create` + `user.update` sueltos ([restaurant/route.ts:52-75](apps/api/app/api/restaurant/route.ts)): un fallo a mitad (o el doble-POST de A-10) deja un restaurante huérfano con código válido y 0 miembros — el mismo zombi de P1-2. Fix: `$transaction` con guard `restaurantId: null` re-chequeado dentro. *(Cara servidor de A-10, que solo cubría el cliente — y el cliente ya está corregido, ver "Estado del BACKLOG".)*
- **P2-3 · El write de staff no re-filtra por restaurante** *(aporte Codex)*. PATCH/DELETE validan al target al leer, pero el `update` va solo por `id` ([staff/[userId]/route.ts:49-53](apps/api/app/api/restaurant/staff/[userId]/route.ts), [:99-102](apps/api/app/api/restaurant/staff/[userId]/route.ts)): si el target cambió de restaurante entre lectura y escritura, modificas a alguien de **otro** restaurante. Ventana mínima, pero es una escritura cross-tenant. Fix: `updateMany` con `{ id, restaurantId: ctx.restaurantId }` y comprobar `count`.
- **P2-4 · Añadir plato/sección: colisión de `order` sin unique.** Dos adds casi simultáneos leen el mismo `last.order` y crean dos filas con el mismo orden ([items/route.ts:25-52](apps/api/app/api/menus/[id]/items/route.ts), [sections/route.ts:34-44](apps/api/app/api/menus/[id]/sections/route.ts); sin `@@unique` en schema). Render inestable. Fix: transacción o `@@unique([menuFolderId, order])` + retry. *(Es también lo que permite el duplicado del P1-10.)*
- **P2-5 · Reordenar platos: lost-update.** El swap lee los `order` fuera de la transacción ([reorder/route.ts:36-57](apps/api/app/api/menus/[id]/items/reorder/route.ts)): dos reorders concurrentes pueden dejar dos platos con la misma posición. Fix: releer dentro del `$transaction`.
- **P2-6 · Webhook de Stripe sin idempotencia por `event.id`.** Un evento reentregado fuera de orden puede regresar `planStatus` a un estado viejo ([stripe/webhook/route.ts:98-166](apps/api/app/api/stripe/webhook/route.ts) — último-que-escribe, sin tabla de dedup). Fix: tabla `ProcessedStripeEvent` + skip si ya visto. *(Hoy candado OFF → P2; será P1 cuando actives cobros.)*
- **P2-7 · Borrar el restaurante no cancela la suscripción de Stripe.** El caso C borra la fila con `stripeSubscriptionId` dentro sin llamar a `subscriptions.cancel` ([leave/route.ts:84-111](apps/api/app/api/restaurant/leave/route.ts)) → Stripe seguiría cobrando a un restaurante que ya no existe. Fix: cancelar antes de borrar. *(Misma nota GTM que P2-6.)*
- **P2-8 · La transacción del caso C no tiene timeout configurado.** 15 deletes con el default de Prisma (5 s) ([leave/route.ts:84](apps/api/app/api/restaurant/leave/route.ts)): un restaurante con meses de mensajes/audit-log puede abortar siempre → el último miembro **no puede** ni borrar ni salir (rollback limpio, sin corrupción). Fix: `{ timeout: 30_000 }` o borrar Message/AuditLog por lotes antes.
- **P2-9 · El cron de criticidad puede pisar una edición manual concurrente.** Lee todos los productos, calcula, y escribe sin re-chequear `criticalityManual` dentro de la transacción ([lib/products/recalc.ts:59-71](apps/api/lib/products/recalc.ts), [:158-165](apps/api/lib/products/recalc.ts)). Transitorio (el próximo run lo respeta). Fix: `updateMany` con guard `criticalityManual: false`.
- **P2-10 · Fotos huérfanas en Vercel Blob — `del()` no existe en todo el backend.** Cada re-subida de foto (restaurante, perfil, estilo) sube un blob nuevo y descarta la URL vieja sin borrarla; y el caso C borra la base de datos pero **ninguna foto**: quedan públicas y facturando para siempre ([lib/blob.ts:1](apps/api/lib/blob.ts) — único import es `put`; [restaurant/photo/route.ts](apps/api/app/api/restaurant/photo/route.ts); [leave/route.ts:84-111](apps/api/app/api/restaurant/leave/route.ts)). No es visible para el usuario, pero viola la expectativa de "borrado" y crece sin límite. Fix: `del(urlVieja)` best-effort al re-subir + limpieza de blobs en el caso C.

### Móvil

- **P2-11 · Ajustes de idioma y modelo IA fallan en silencio total.** `patchMe(...).catch(() => null)` sin toast ni revert ([ProfileSheet.tsx:74-82](apps/mobile/src/components/ProfileSheet.tsx)); el patrón correcto está 12 líneas más abajo (`handleReturnToAppModels`, L92-99). El idioma se aplica en pantalla pero puede no guardarse nunca.
- **P2-12 · Renombrar el restaurante desde Casa no propaga.** Falta el `patchLocalUser` que el mismo endpoint sí tiene en ExportPreviewSheet ([casa.tsx:118-130](apps/mobile/app/(tabs)/casa.tsx) vs [ExportPreviewSheet.tsx:230-239](apps/mobile/src/components/ExportPreviewSheet.tsx)): el perfil y el **nombre del PDF exportado** conservan el nombre viejo hasta reiniciar.
- **P2-13 · Cambios de rol/expulsión hechos por otro admin no llegan a tu sesión.** Los gates de permisos leen `useAuth` y nada lo refresca cuando te cambian desde otro móvil: ves botones que fallarán con 403 (el servidor sí te frena — relee la DB en cada request) hasta reiniciar. Además Casa te deja abrir tu **propia** ficha y el servidor responde un 400 crudo ([StaffMemberSheet.tsx:39-66](apps/mobile/src/components/StaffMemberSheet.tsx) — `onChanged` sin `refreshMe`; [casa.tsx:269-274](apps/mobile/app/(tabs)/casa.tsx) — sin filtrar tu fila). Fix: `refreshMe()` en `onChanged` + ocultar/deshabilitar tu propia fila. *(Un auditor lo propuso P1 con el escenario "auto-degradarse"; verificado que el servidor bloquea tocarte a ti mismo — recalibrado a P2.)*
- **P2-14 · Grupo: botones de acción sin guard de doble-tap.** Idempotentes o de bajo daño, pero generan requests dobles y toasts de error confusos: transiciones de estado de receta ([recetas/[id].tsx:85-94, 152-174](apps/mobile/app/recetas/[id].tsx)) y menú en servicio ([menus/[id].tsx:551-562](apps/mobile/app/menus/[id].tsx)); **borrar plato sin confirmación ni guard** y flechas de reorden que solo se deshabilitan en los extremos ([menus/[id].tsx:237-258, 326-328, 623-635, 717-753](apps/mobile/app/menus/[id].tsx)); `handleRemove` de staff (su hermano `handleRoleChange` sí tiene guard, [StaffMemberSheet.tsx:56-66](apps/mobile/src/components/StaffMemberSheet.tsx)); regenerar código ([casa.tsx:108-116](apps/mobile/app/(tabs)/casa.tsx)); y `ConfirmSheet` compartido sin prop `busy` — toda su protección es que el caller cierre el modal a tiempo ([ConfirmSheet.tsx:44-49](apps/mobile/src/components/ConfirmSheet.tsx)). Fix: patrón `busy`/`disabled` que ya usan los hermanos correctos de cada archivo.
- **P2-15 · Errores de red muestran códigos internos sin traducir.** 51 sitios en 15 archivos hacen `err.message` directo al toast (`network_unreachable`, `request_timeout`) cuando `apiErrorMessage(err, t)` ya existe y 6 archivos lo usan bien. Emparenta con A-11 (errores de API sin traducir). Fix: barrido mecánico de reemplazo.
- **P2-16 · Sentry ciego (servidor) e inexistente (móvil).** El server solo captura excepciones *no* manejadas — y casi todas las rutas capturan y responden JSON, así que fallos reales (PDF, IA, Blob) nunca llegan; `logger.error` no reporta ([lib/logger.ts:7-11](apps/api/lib/logger.ts), [instrumentation.ts:12](apps/api/instrumentation.ts)). En `apps/mobile` no hay `@sentry/react-native` en absoluto: cero visibilidad de crashes del pilot. Fix: `Sentry.captureException` en los catches importantes + evaluar Sentry RN.
- **P2-17 · Sin ErrorBoundary global en móvil.** Cualquier excepción de render tumba la app a la pantalla nativa sin fallback ni registro ([_layout.tsx](apps/mobile/app/_layout.tsx) no exporta `ErrorBoundary`; no hay handler global). Fix: `export function ErrorBoundary` en el root layout con pantalla de reintento.
- **P2-18 · Pull-to-refresh no llegó a Casa ni a las 3 papeleras.** El resto de pantallas con datos ya lo tienen (e46baf4/9e3b06b); estas 4 exigen salir y volver ([casa.tsx](apps/mobile/app/(tabs)/casa.tsx), [recetas/papelera.tsx](apps/mobile/app/recetas/papelera.tsx), [productos/papelera.tsx](apps/mobile/app/productos/papelera.tsx), [menus/papelera.tsx](apps/mobile/app/menus/papelera.tsx)).
- **P2-19 · Detalle de producto llama "404" a cualquier fallo.** Único detalle que sí resuelve el error a estado final, pero etiqueta un fallo de red como "404" y sin reintento ([productos/[id].tsx:390-397](apps/mobile/app/productos/[id].tsx)).

---

## P3 — Menor (oportunista)

- **P3-1 ·** `migrateLegacyRecipes` dry-run sin guard → doble-tap apila dos `Alert` ([productos/ajustes.tsx:100-152](apps/mobile/app/productos/ajustes.tsx)). El apply real queda detrás del Alert nativo (razonablemente seguro).
- **P3-2 ·** Restaurar desde papelera: guard funcional correcto pero sin `disabled` visual (las 3 papeleras; pariente del BP-06 ya conocido).
- **P3-3 ·** `audit()` corre fuera de la transacción de su mutación: si el audit falla, la acción queda sin registro *(aporte Codex; el censo confirmó que todos los call-sites sí hacen `await`)*.
- **P3-4 ·** Una request ya en vuelo sobrevive a la expulsión del que la lanzó (contexto capturado antes del kick; ventana de milisegundos) *(aporte Codex)*.

---

## Verificado como CORRECTO (para no re-auditarlo)

- **Invalidación cruzada de cachés móviles completa** donde duele: menús↔recetas (14+6 mutaciones revisadas una a una) y productos↔recetas (costo/matching, `bumpProductCache`). 37/40 mutaciones invalidan bien; las 3 restantes son los hallazgos P2-12/P2-13.
- **Escrituras multi-tabla atómicas:** crear receta+ingredientes, PATCH con reemplazo de ingredientes, duplicar receta/menú, yield-test+producto, borrado caso C (orden topológico validado contra los 5 `onDelete: Restrict`).
- **Expulsión sin acceso residual a datos:** `permissions-guard` relee rol/restaurante de la DB en cada request (el token viejo no da acceso; la vía real de re-entrada es P1-3).
- **401 → deslogueo limpio** vía `setUnauthorizedHandler`; chat: enviar mensaje y "guardar como receta" sí tienen guard anti doble-tap.
- **A-10 (cliente) ya está corregido en el código** — `create-restaurant.tsx` y `join-with-code.tsx` usan la respuesta del server (`patchLocalUser`) con comentarios `// A-10 / Ola 0 0.2`. **El BACKLOG.md está desactualizado en el ítem 0.2**: lo pendiente que queda de A-10 es solo la cara servidor (P2-2 de este informe).

---

## Cobertura y límites

- **Servidor:** las ~30 rutas de escritura leídas a fondo; GET puras someras. Pendiente de pasada dedicada: `conversations/[id]/messages` (contadores AiUsage; protegido por unique `(userId,day)`), `recipes/upload|extract|import-gdoc`, `products/match|migrate-recipes`.
- **Móvil:** pantallas y hooks de datos a fondo; con menor profundidad: formularios `nueva/editar/cargar/ajustes`, y sheets menores (allergen picker, pezzatura, autocomplete).
- **Análisis estático puro** (sin `node_modules`, sin ejecutar tests ni la app) — los escenarios de carrera están razonados sobre el código y las garantías de Postgres/Prisma, no reproducidos en vivo.
- Codex trabajó con el código **inline** (7 archivos completos + schema recortado) vía `--prompt-file`; marcó como ASSUMPTION lo no incluido, y esas asunciones se verificaron aquí contra el código real antes de entrar al informe.
