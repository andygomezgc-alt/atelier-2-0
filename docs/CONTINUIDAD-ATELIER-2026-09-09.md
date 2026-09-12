# Continuidad de Atelier — actualizado el 12 de septiembre de 2026

> **Pausa y sincronización solicitadas el 12-09-2026:** el usuario pide detener el desarrollo y guardar todo en la carpeta original y el repositorio. La carpeta original es `C:/Users/Utente/Desktop/atelier-2-0`, rama `main`. Consultar primero [ESTADO-ACTUAL.md](ESTADO-ACTUAL.md), que sustituye los estados históricos contradictorios de abajo. Landing de piloto y preparación técnica de pagos listas localmente; cobros desactivados, pendiente Stripe de prueba y acceso web autenticado. Fundador: descuento máximo de tres meses. Primera copia automática del 12-09 confirmada en Drive a las 07:02 UTC; ya no está pendiente observarla. No reanudar desarrollo ni activar pagos por esta petición de sincronización.

> **Cierre 11-09-2026, 21:24 UTC:** privacidad y eliminación publicadas en `dpl_EH6DcTAhVXfHpCYsfKaVAduq8CeP`, salud correcta. Apple confirmó build 9 APPROVED e IN_BETA_TESTING para Chefs; enlace público https://testflight.apple.com/join/kY83jmnk . La revisión externa ya NO está pendiente. Copias ACTIVE y prueba manual correcta; primera ejecución por horario aún pendiente de observar. [Cierre verificado](CIERRE-PRIVACIDAD-TESTFLIGHT-2026-09-11.md).

> **Entrega móvil completada el 11-09-2026:** Android 0.1.0/4 FINISHED, APK verificado; iOS 0.1.0/9 FINISHED y envío a Apple FINISHED, procesamiento VALID e IN_BETA_TESTING para el grupo interno Equipo. Para chefs externos sigue READY_FOR_BETA_SUBMISSION: revisión beta todavía pendiente. No hay builds que deban relanzarse. Falta prueba física, privacidad y preparación externa. [Entrega y enlaces](ENTREGA-MOVIL-2026-09-11.md). Esta actualización sustituye los pendientes históricos de compilación indicados abajo.

> **Actualización del 11-09-2026, 14:06 UTC:** servidor y las tres migraciones de ideas/cuotas/presupuesto ya publicados en producción (`dpl_FfUPJPPNuKeYbfjQFFzqDcx9TUXB`). Dominio público y salud verificados. Pendientes las compilaciones Android/iPhone, el indicador en el teléfono y la prueba física. Clave externa ya custodiada en Google Password Manager; copia previa a esta publicación confirmada en Drive. Este estado sustituye las menciones históricas de «solo QA», «sin publicar» y «custodia pendiente» que siguen abajo. Detalle: [Publicación del piloto](PUBLICACION-PILOTO-2026-09-11.md).


Punto de entrada para retomar después de compactar el contexto o iniciar otra conversación en este proyecto. Actualización incremental solicitada por el usuario antes de compactar; se conserva el nombre del archivo para mantener los enlaces. Describe el último estado comprobado, no una nueva comprobación de producción. No contiene claves.

## Momento actual

**Objetivo vigente:** preparar el piloto Android/iPhone para unos **cinco chefs**. Acuerdo actualizado: **50 EUR para un mes de IA del conjunto, 140 Gemini (20 × 7) y 8 Opus por chef en ventanas móviles de siete días**. Gemini usa cuota semanal para concentrar su uso cuando haga falta; cada plaza se recupera siete días después. La cuenta principal indicada por el usuario queda sin cuota de mensajes, **dentro del presupuesto común**. Control implementado y probado localmente; migraciones **solo QA**, pendiente de publicación. [Implementación y pruebas](CONTROL-GASTO-IA-2026-09-10.md). Facturación Gemini activada por el titular y comprobada el 11-09; no se publicó una versión. Cuenta Apple/app iOS existentes; conservar acceso. Gratuidad del piloto para los chefs aún por concretar.

**Última instrucción de producto: conservar el acceso actual de iPhone.** Android mantiene Google; iPhone conserva Apple y Google. El creador del restaurante obtiene `admin` automáticamente; el invitado entra como `viewer`/Lector y el administrador cambia su categoría desde Casa → Staff → miembro. No se autorizó elevar automáticamente a todos los invitados. El login móvil no ofrece email; sus rutas y enlaces heredados todavía existen y su incidencia no bloquea el piloto actual. Esta última revisión fue de lectura y pruebas: no cambió login ni permisos.

**Publicado:** memoria culinaria, corrección de guardado y Nuevo chat. El usuario confirmó resuelto el guardado. **Pendiente de publicación:** ideas sin conexión y control de gasto/cuotas semanales; requieren sus tres migraciones, API y apps finales. Copia real cifrada y ensayo de restauración completados; custodia externa en Google Password Manager completada; falta observar la primera ejecución por horario.

No hay build EAS en curso. **Automatización activa:** «Copia diaria de Atelier», ID `copia-diaria-de-atelier`, a las 09:00 hora de Italia; requiere ordenador encendido, Codex y Drive accesibles. Recorrido completo probado, primera ejecución por horario aún no observada. Conserva todas las copias del piloto y avisa solo ante incidencias. [Rutina diaria](COPIAS-DIARIAS-2026-09-11.md). Copias cifradas y manifiestos en [Atelier - Copias cifradas](https://drive.google.com/drive/folders/1RC5Mht61LVFcJ8G4IxJYGGRqLmt35S4F), acceso restringido solo propietario. **Clave custodiada en Google Password Manager:** registro `atelier-backup.invalid`, usuario `recuperacion-atelier-base64`, clave original de 32 bytes codificada en Base64. Registro observado en la cuenta de Google el 11-09 tras importación por el titular; CSV temporal eliminado y clave local intacta. No se reveló ni se volvió a leer el secreto guardado en Google. Instrucciones de recuperación en la rutina diaria. **Gemini activo:** Nivel 1 · Prepago, crédito observado 25 EUR, recarga automática desactivada y tope adicional Google de 20 EUR/mes aplicado. Está dentro de los 50 EUR comunes, cuyo control en Atelier aún no se publicó. No hubo compras ni invitaciones. [Facturación](FACTURACION-Y-COPIA-EXTERNA-2026-09-11.md).

## Decisiones del producto que deben mantenerse

- Aplicación para chefs y su equipo, especialmente durante el trabajo en cocina. Pocas pantallas, acciones directas, sencillez. No convertirla en un sistema complejo de gestión de cocina.
- Priorizar calidad creativa cuando se solicita; usar un modelo económico para consultas cotidianas y automatizaciones acotadas. Reducir contexto y llamadas innecesarias.
- Chat Diario: Gemini 3.8 Flash (`gemini-3.8-flash`). Chat Creativo: Claude Opus 5 (`claude-opus-5`). GLM 5.3 Flash (`glm-5.3-flash`) para extracción, estilos de menú y memoria. Versiones configurables en servidor.
- Costes automáticos con reglas, sin IA. Banco de productos en kg/l, con conversiones g/ml. El banco sirve como referencia de precios, no como lista obligatoria de ingredientes disponibles.
- Escaneo de fotos/PDF para el estilo de cualquier restaurante. Koko es una referencia de prueba, no una plantilla universal.
- Memoria breve del restaurante, compartida entre ambos chats, editable y opcional. La petición actual del chef prevalece sobre las tendencias aprendidas.
- Mantener las firmas y cuentas existentes. El rol Lector no permite capturar ideas ni editar recetas/productos: preparar la categoría adecuada de cada chef usando el control existente, sin añadir otro recorrido.

## Publicado y configurado

Detalle de configuración inicial: [Activación de IA](ACTIVACION-IA-2026-09-09.md). Para despliegues posteriores prevalece este resumen y los informes fechados de cada cambio.

- API pública: https://atelier-2-0-mu.vercel.app
- Vercel activo: `dpl_9xELXJ3xMUFBLAUC6wjJ4TVGEaY7` (títulos del historial). Anterior recuperable: `dpl_ChoCyN7j4mruneQ7pqvN6YijnVvi` (conversión de recetas). Otros anteriores: `dpl_7xKYCr2dukLoCLg6AqXqd6noL6rG` (memoria) y `dpl_7uegDpUua2UxwRJr6Gguk5NfzfpH` (activación). Proyecto `atelier-2-0`, raíz configurada `apps/api`; ejecutar CLI Vercel desde la raíz del repositorio.
- Promovido a las 17:27 UTC del 9 de septiembre. Salud pública comprobada de nuevo el 10: `status: ok`, base, Anthropic, Gemini, Z.AI y Resend correctos. No equivale a una generación creativa completa ni a un envío real de correo.
- Las cuatro migraciones de revisión de alérgenos, guardado/chat, unidades/versiones de menú y memoria están aplicadas a producción. La base local de pruebas es distinta de la de producción.
- Gemini y GLM superaron llamadas reales mínimas. Proyecto Google `gen-lang-client-0628677395`: **Nivel 1 · Prepago confirmado el 11-09** tras el vínculo hecho por el titular. Crédito observado 25 EUR, sin recarga automática; límite mensual del proyecto guardado en 20 EUR. No comprar más créditos ni repetir la activación. La comprobación de facturación no incluyó una nueva generación.
- Paquete GLM observado activo: 100 millones de tokens, vencimiento 9 de diciembre de 2026. Lo compró el usuario; el agente no efectuó un pago. La cuota se consume desde el servidor para los distintos usuarios de la app.
- Anthropic de producción autentica correctamente. La clave local devuelve 401: no sobrescribir la clave de producción con la local. Falta verificar una generación completa de Opus en el uso real de esta versión.
- Claves solo en variables sensibles del servidor y archivo local excluido de Git. No copiar claves a documentación, cliente, mensajes ni registros. No repetir compras ni crear nuevas claves para continuar.

## Versiones móviles actuales

- EAS build `2361ab2e-d4ff-457c-b4b9-a7f8055c239a`, terminado, perfil `pilot`, incluye «Nuevo chat».
- Android `com.atelier.app`, versión visible `0.1.0`, `versionCode: 3`, firma existente conservada. Instalar como actualización de la versión 2.
- [Descargar APK](https://expo.dev/artifacts/eas/JLApXEBBVGj_k2_IbwKod0APLaFTVv6k-A94dmQkWJs.apk). Verificado HTTP 200 y 111.355.754 bytes.
- [Página del build](https://expo.dev/accounts/andygome/projects/atelier/builds/2361ab2e-d4ff-457c-b4b9-a7f8055c239a).
- La distribución EAS informa caducidad el 23 de septiembre de 2026. APK anterior: build `5faac929-7aeb-460f-8d49-922b9bfffa6e`.
- El build incorporó los cambios del directorio de trabajo aunque la etiqueta de commit de EAS muestre el HEAD anterior. El usuario prueba la app instalada, no Expo Go.
- **iPhone existente:** EAS `9bffed12-a5b8-4a43-bdc5-c10ada51dd4d`, `FINISHED`, creado el 30 de julio a las 11:06 UTC; versión `0.1.0`, build **8**, bundle `com.atelierchef.app`. Perfil `testflight` de `apps/mobile/eas.json`, firma existente. No se comprobó el grupo/revisión actual de App Store Connect ni se probó físicamente el login en esta revisión.
- Cuenta EAS `andygome`, proyecto `atelier`, ID `813bc6e8-bac0-4377-ba73-26825523db2e`. Android 3 incluye Nuevo chat, pero no la corrección posterior de ideas sin conexión; iOS 8 es anterior a las mejoras recientes. Actualizar ambas plataformas al cerrar los pendientes, con servidor/migraciones primero.

## Funciones y validaciones anteriores

- Validación histórica de una entrega anterior: 943 pruebas locales entre API, contratos compartidos, móvil e idiomas. Ocho agotaron la inicialización y pasaron aisladas. No presentar esta cifra como una ejecución completa del estado final actual.
- TypeScript API/móvil, compilación Next local y Linux Vercel y exportación Android/Hermes correctos.
- Guardado de receta/productos transaccional, recuperación de borradores y reintentos identificados del chat/recetas; no extender esa garantía a toda escritura de la app.
- Correcciones de costes, merma, alérgenos revisables, permisos y exportación PDF.
- Estilos de menú con propuesta, previsualización, activación, recuperación de versiones y caché de referencias. Precios y cargos con unidades explícitas.
- PDF convertido localmente hasta diez páginas para GLM. Koko real de dos páginas y diseños sintéticos variados comprobados sin llamadas de generación; esto no acredita fidelidad total del escaneo con GLM en producción.
- Chat con contexto limitado, cancelación y registro del modelo utilizado. Sin cambio automático oculto a otro proveedor ni reintentos de generación indiscriminados.
- **Nuevo chat, publicado:** botón visible, Historial, modelo conservado y `chatSession` que reinicia el contexto de pantalla; ninguna llamada al abrir un chat vacío. Títulos deterministas de hasta 140 caracteres, prioridad al título de la idea. Guardas ante borradores, respuestas tardías, streaming/dictado/extracción. 129 pruebas móviles + 4 API + 5 idiomas = 138; tipos y exportación correctos. [Detalle](NUEVO-CHAT-2026-09-09.md).
- **Guardado, cerrado por el usuario:** dos extracciones GLM dieron 422; tres reintentos diagnósticos de la misma receta fueron correctos. Se publicó normalización de formatos recuperables y diagnóstico sin contenido privado; 71 pruebas y tipos. No se capturó la respuesta original defectuosa ni se guardó manualmente una receta del usuario en producción. [Detalle](INCIDENCIA-GUARDADO-2026-09-09.md).

## Trabajo reciente y rastro de archivos

Las rutas de esta sección parten de `C:/Users/Utente/Desktop/atelier-2-0/`. El estado «modificado» describe estas tareas, no una lista completa de todos los cambios acumulados en Git.

### Control de gasto — implementado, pendiente de publicación

- Nuevos `apps/api/lib/ai/budget-policy.ts`, `budget.ts`, `GET /api/ai-budget` y modelos `AiBudget`, `AiGeneration`, `AiChatQuota`. Migraciones **20260910120000_ai_pilot_budget y 20260910150000_weekly_daily_chat solo en QA** (29 migraciones). **140 Diario/7 días y 8 Creativo/7 días móviles**, utilizables juntos, sin reinicios de calendario. Cuenta principal exenta de mensajes por identidad en DB, sin cambiar roles ni login. Se retiró del chat normal/preview el tope antiguo de 120/día; se mantiene para acciones técnicas. `dailyAt` conserva historial de generaciones recientes al migrar; `day`/`dailyCount` ya no limitan el chat.
- Reserva global atómica previa a cada generación en chat/GLM, incluido cron y escaneo múltiple. Periodo único de un mes desde primera reserva; sin renovación/recarga automática. Margen conservador **1 USD = 1,25 EUR de asignación interna**, no factura exacta. Retiene coste incierto, liquida una vez y bloquea tarifas desconocidas/uso fuera de cotas. Gasto conservado al borrar usuario.
- Nuevo `PilotBudget.tsx` en Perfil: indicador y aviso al 75 % solo para el titular. No hay push/email ni automatización. Errores ES/IT/EN integrados en chat, extracción y estilos.
- Validación actual: **149 API + 148 móviles + 253 compartidas + 5 idiomas = 555 comprobaciones**. Tipos API/móvil correctos. `apps/api/scripts/check-ai-budget.ts` probó concurrencia real en QA, cuotas 140/8, caducidad exacta, separación de cuota técnica/telemetría, excepción, corte global para titular, reserva incierta, liquidación idempotente y no renovación. Limpió datos sintéticos; cero generaciones reales. La migración semanal pasó además un ensayo con tablas temporales del esquema anterior, preservando usos recientes y Opus.
- Exportaciones Hermes de la tarea anterior, antes del ajuste semanal: Android **2.293 módulos**, `output/ai-budget-android`; iOS **2.214**, `output/ai-budget-ios`. No son APK/IPA ni prueba física; actualizar la compilación final para incluir este ajuste. Detalle: [Control de gasto](CONTROL-GASTO-IA-2026-09-10.md).

### Ideas sin conexión — implementadas, pendientes de publicación

- Modificados `apps/mobile/src/hooks/useOfflineQueue.ts` (`saveIdea`, `flushQueue`), `apps/mobile/src/api/ideas.ts` y `apps/mobile/app/(tabs)/inicio.tsx`: persistir `{id,text,createdAt}` antes del primer POST; reutilizar `clientRequestId`, `expectedRestaurantId`, `expectedAuthorId`; bloquear doble toque y conservar borrador ante error. Cola serializada y aislada por propietario.
- Creado `apps/api/lib/create-idea.ts` (`saveNewIdea`, `IdeaSaveError`); modificados el POST `apps/api/app/api/ideas/route.ts`, contratos/errores compartidos y traducciones. Recibo transaccional con hash del texto; colisión P2002 devuelve el ganador y revierte la idea provisional. Respuestas 201 nueva, 200 repetida, 410 eliminada; códigos `idea_save_conflict`, `idea_owner_changed`, `idea_already_deleted`.
- Modelo nuevo `IdeaCreateReceipt` en `packages/db/prisma/schema.prisma`; migración **`20260909190000_retryable_ideas` aplicada solo a QA**. Servidor compatible con cuerpos antiguos sin identificador, que no reciben esta deduplicación. No fusionar ideas por texto ni prometer deduplicación retroactiva.
- 23 pruebas de cola + 4 nuevas de pantalla (`apps/mobile/src/__tests__/idea-save.test.ts`) + otras 115 móviles = **142 móviles**. 11 pruebas nuevas del POST, 253 compartidas y 5 idiomas; tipos de los cuatro paquetes y exportación Hermes correctos (`output/ideas-offline-android`, 2.292 módulos). Regresión original reproducida antes del arreglo.
- Nuevo `apps/api/scripts/check-idea-saves.ts`: cinco envíos reales concurrentes en QA producen una idea/recibo; conserva edición/archivo y no resucita eliminadas. Datos sintéticos limpiados; P2002 esperados. Sin IA ni producción.
- Sincroniza al volver a Inicio/actualizar, no continuamente en segundo plano. Cierre de sesión manual limpia colas según política previa; sesión expirada las conserva. [Informe completo](IDEAS-SIN-CONEXION-2026-09-09.md).

### Copias — producción cifrada y recuperación verificadas; custodia externa pendiente

- Modificado `scripts/db-backup.mjs`; creados `scripts/lib/pg-backup.mjs`, `scripts/db-restore.mjs`, `scripts/check-db-backup.mjs`. `createBackup` genera archivo nativo y manifiesto SHA-256; `verifyBackup` comprueba integridad; `restoreBackup` exige destino distinto/vacío y revierte todo ante error. Contraseñas por entorno, sin contenido SQL en registros.
- Restauración requiere `RESTORE_DATABASE_URL`, no recurre a `DATABASE_URL`; sin `--apply` solo verifica. No usa `--clean` ni `--create`. Comandos en `package.json`: `db:backup`, `db:restore`, `test:backup`; exclusiones de volcados/herramientas en `.gitignore`, `.easignore`, `.vercelignore`; actualizado `docs/OPERACIONES.md`.
- Ensayo real con **27 migraciones, 24 modelos, 25 tablas y 51 filas sintéticas**: hashes/cantidades idénticos, decimales, NULL SQL/JSON y trigger de memoria. Rechaza origen, destino ocupado y archivo alterado; un dump truncado revierte toda la restauración. Dos bases temporales por ensayo, eliminadas al terminar.
- Clientes PostgreSQL portátiles **17.11** en `output/postgresql-tools/pgsql/bin`; sin servidor instalado ni cambios de Windows. Artefactos sintéticos en `output/backup-qa/`. El ZIP descargado fue eliminado tras extraer los clientes.
- **Actualización posterior:** `scripts/backup-production.mjs`, `backup-unpack.mjs`, `lib/backup-encryption.mjs` y tres pruebas de cifrado. Primera copia real completa a las **18:02:48 UTC**, `output/atelier-backups/archives/atelier-2026-09-10T18-02-48-545Z-304264e0.atbak`, **1.930.797 bytes**, incluye los **3 objetos Blob**. Descifrada y verificada; temporales sin cifrar eliminados. Dos referencias externas ajenas a Blob se registran sin descargar. No hubo escrituras en producción ni restauración de datos reales en QA.
- Producción observada **PostgreSQL 18.6, 24 tablas, 26 migraciones**. Nuevos clientes oficiales 18.6 en `output/postgresql18-tools/pgsql/bin` (sin instalar servidor, ZIP eliminado). Copia con instantánea exportada compartida entre referencias y `pg_dump`. Ensayo actualizado QA: **29 migraciones, 28 tablas, 53 filas**, superado y bases temporales eliminadas.
- Configuración privada `output/atelier-backups/config.json`; clave **`output/atelier-backups/keys/recovery.key`**, nunca mostrar ni subir junto a las copias. Carpeta ACL solo propietario/SYSTEM, excluida de Git/EAS/Vercel. `last-run.json` registra resultado y `running.lock` evita simultaneidad. El script de preparación ya se ejecutó: **no repetirlo**; para otra copia usar `node scripts/backup-production.mjs output/atelier-backups/config.json` con permisos del propietario. `.env.prod-check` existente contiene origen correcto y Blob; el script toma solo esos dos campos. No descargar variables de Vercel en bloque.
- **Copia externa y rutina diaria completadas el 11-09:** `.atbak` y manifiesto en la carpeta privada de Drive; `G:/Il mio Drive/Atelier - Copias cifradas` corresponde a ella. Nuevos `backup-daily.mjs`, `lib/backup-sync.mjs` y 7 pruebas de sincronización; 10 con cifrado, todas correctas. Identidad del destino por marcador sin secretos, copia exclusiva/idempotente, validación de hashes, bloqueo, reutilización del día y conservación de todas las copias. `last-daily.json` separa `awaiting_cloud_confirmation` de `cloud_confirmed`: confirmar solo tras observar el paquete exacto y manifiesto en Drive web. Copia del 11-09 09:54 UTC `atelier-2026-09-11T09-54-37-171Z-89adfb01.atbak`, confirmada; segundo intento no duplicó ni volcó otra vez. Automatización existente `copia-diaria-de-atelier`, heartbeat diario 09:00; no crear otra. No se subió la clave. **Pendiente:** custodia independiente de clave, primera ejecución por horario y comprobar retención real de Neon. [Rutina y límites](COPIAS-DIARIAS-2026-09-11.md).

### Acceso y equipo — inspección, sin cambios de código

Leídos `apps/mobile/app/(auth)/login.tsx`, `apps/mobile/src/hooks/useAuth.ts`, rutas `apps/api/app/api/mobile/auth/apple/` y `google/`, `apps/api/lib/oauth-identity.ts`, rutas `restaurant/route.ts`, `restaurant/join/route.ts`, `restaurant/staff/[userId]/route.ts`, `casa.tsx` y `StaffMemberSheet.tsx`. Se comprobaron nonce/identidad OAuth, creación transaccional con admin, invitado viewer, edición de roles solo por admin del mismo restaurante y protección del último admin. Algunos archivos ya tenían cambios anteriores: no atribuirlos a esta revisión.

Pasaron **46 pruebas API + 9 de sesión móvil + 8 de correo heredado = 63**. Las ocho de correo agotaron el arranque conjunto y pasaron aisladas con 30 s; proveedor simulado, ningún email enviado. No fue una prueba física en iPhone. El error heredado de Resend queda pospuesto mientras no se vuelva a ofrecer email. [Decisiones y pruebas](PREPARACION-PILOTO-2026-09-10.md).

## Memoria: cómo debe probarse

En Perfil → Nuestra cocina, la descripción orienta inmediatamente a ambos chats. El aprendizaje depende de la preferencia del restaurante; no se activó globalmente.

Usa recetas en prueba o aprobadas, deduplica copias y requiere al menos tres elaboraciones distintas que respalden cada tendencia. Hasta veinte recetas acotadas, sin banco, precios ni conversaciones completas. El cron corre a las 05:00 UTC; primera generación en la siguiente ejecución elegible y después como máximo un intento cada siete días. No prometer aprendizaje instantáneo al guardar una receta. El chef puede corregir, excluir y borrar tendencias.

Validación real completada con tres perfiles GLM y un nuevo chat Gemini: máximo cuatro tendencias por generación, evidencia suficiente, límites atómicos, cancelación al desactivar y protección de revisiones obsoletas. No llama al modelo si todas las categorías están corregidas/excluidas; cambios de precios no invalidan memoria. Correcciones publicadas: [Validación](VALIDACION-MEMORIA-2026-09-09.md). **Falta observar una ejecución real del cron de producción.** No hay secreto local para invocarlo y el acceso anterior al panel fue bloqueado por revisión automática; no eludirlo ni descargar variables en bloque.

## Pendientes por prioridad

1. **IA y gasto del piloto:** control de 50 EUR/140 Diario por siete días/8 Creativo por siete días y excepción de mensajes principal **implementado y probado**, pendiente de publicación; [informe](CONTROL-GASTO-IA-2026-09-10.md). Incluye cron y cada generación GLM, margen conservador y reservas de consumo incierto. No volver a pedir presupuesto o participantes. Facturación Gemini ya activa y tope adicional Google 20 EUR/mes aplicado; no repetir compra GLM ni activar recargas automáticas. Validar Perfil del titular en la entrega; no presentar cuotas como garantía de consumirlas completas por 50 EUR.
2. **Datos y privacidad:** completar las copias operativas indicadas arriba. `apps/api/app/privacidad/page.tsx` todavía citaba solo Anthropic en la revisión del 9 de septiembre; actualizar según Anthropic, Google, Z.AI, memoria y borrado realmente utilizados, contrastando condiciones vigentes. No atribuir sin verificar a usuarios del EEE las condiciones generales de entrenamiento del nivel gratuito.
3. **Validación final Android e iPhone:** acceso conservado, crear/unirse a restaurante y rol; chat Diario/Creativo, Nuevo chat/historial, receta guardada y reabierta, kg/l, alérgenos, menú/PDF y cortes de red. Falta generación completa de Opus en esta versión y ejecución observada del cron. Probar GLM con documentos de varios restaurantes: Koko y diseños sintéticos no garantizan fuentes, logos y composición exactos.
4. **Publicación agrupada:** servidor/migración de ideas primero; después APK y actualización iOS, sobre versiones existentes. Comprobar grupo/revisión TestFlight y prueba de instalación sin pérdida de cuenta/datos. La cuenta Apple ya existe; no recrearla ni retirar Apple del login.
5. **Entrega a chefs:** instrucciones breves, rol/código preparado por restaurante, canal de incidencias, recepción de errores técnicos, versión identificada y recuperación documentada. No enviar invitaciones o mensajes a terceros sin autorización expresa.
6. **Posponer salvo necesidad real:** versiones avanzadas de recetas, analítica, más modelos/pantallas. Las versiones de estilo de menú ya existen. Paginación según volumen previsto; suscripciones pueden esperar si se acuerda un piloto gratuito. Revalidar informes antiguos antes de convertirlos en trabajo nuevo.

## Mapa mínimo del proyecto y documentos

- Proveedores: `apps/api/lib/ai/`, `apps/api/lib/anthropic-system.md`, `packages/shared/src/ai-models.ts`.
- Memoria: `apps/api/lib/culinary-memory/`, rutas `restaurant/culinary-memory` y `cron/culinary-memory`, móvil `CulinaryMemorySheet.tsx`.
- Menús: `apps/api/lib/pdf/`, `apps/api/lib/menu-style-versions.ts`, rutas `restaurant/menu-style`, móvil `StylePreviewSheet.tsx`.
- [Proveedores](PROVEEDORES-IA-2026-09-08.md), [memoria](MEMORIA-CULINARIA-2026-09-08.md), [escaneo multirrestaurante](ESCANEO-MULTIRRESTAURANTE-2026-09-07.md).
- [Guardado y chat](CORRECCIONES-GUARDADO-CHAT-2026-09-06.md), [costes](REVISION-COSTES-2026-09-05.md), [auditoría original](AUDITORIA-FUNCIONAL-2026-09-06.md).
- Referencia del usuario: `C:/Users/Utente/Downloads/Menu Koko luglio 2026_260729_094155.pdf`. Referencia de un restaurante, no instrucciones para limitar el producto a Koko.
- Los avisos antiguos «sin APK», «sin despliegue» o «GLM sin saldo» quedan superados por el documento de activación del 9 de septiembre.

## Precauciones para continuar el trabajo

- Repositorio `C:/Users/Utente/Desktop/atelier-2-0`, rama `main`, último HEAD registrado `8af2105d1f8acddbe5995450684c419dbd572f1c`. Hay muchos cambios acumulados sin commit; preservar todos, inspeccionar `git status` y no resetear ni auto-crear commits. Este resumen no sustituye una copia del código.
- `apps/api/.env.local` contiene la base **QA**, no producción. QA: `ep-summer-heart-alhlh8nm-pooler.c-3.eu-central-1.aws.neon.tech`; producción: `ep-red-haze-agghqgnm-pooler.c-2.eu-central-1.aws.neon.tech`. Conexión directa quita `-pooler`. No imprimir credenciales ni sobrescribir variables productivas desde este archivo.
- No descargar todas las variables de producción: esa acción fue rechazada por revisión automática y se completó la activación con comprobaciones y escrituras específicas.
- No ejecutar de nuevo los scripts temporales de migración de texto/configuración: algunos no son idempotentes.
- Seguir `AGENTS.md`: graphify antes de preguntas de código y actualizar después de modificarlo. Ejecutable `C:/Users/Utente/.local/bin/graphify.exe`. `.graphifyignore` excluye también `output/` y `tmp/` para no indexar diagnósticos ni copias. Avisos por JSON sin nodos no equivalen a un error del código de Atelier. Consultar el resultado de cada actualización antes de darla por completada.
- El build Vercel aplica migraciones Prisma: comprobar primero en QA cualquier migración nueva. La autorización previa de publicación no justifica comprar servicios ni descargar secretos. No hay despliegue nuevo solicitado en este turno de resumen.
- No desplegar cambios nuevos solo por leer este resumen. Continuar según la petición vigente del usuario y los resultados que aporte.

## Herramientas locales para evitar repetir búsquedas

- Node: `C:/Program Files/nodejs/node.exe`. pnpm compatible **9.15.0**: `C:/Users/Utente/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs`; evitar otro pnpm 12 instalado que cambia el almacén virtual.
- Vercel CLI: `C:/Users/Utente/AppData/Roaming/npm/node_modules/vercel/dist/index.js`, ejecutar desde raíz. Flujo de publicación: candidato `deploy --prod --skip-domain`, inspección/salud autenticada y después `promote`. No promover sin comprobar.
- EAS CLI 21.4: `C:/Users/Utente/AppData/Local/npm-cache/_npx/e25a38a8cc65d08e/node_modules/eas-cli/bin/run`; perfiles `pilot` Android y `testflight` iOS, incrementos de versión existentes. No lanzar duplicados por la cola gratuita.
- Para ensayo de copias: establecer `PG_BIN_DIR` a la ruta absoluta `output/postgresql18-tools/pgsql/bin`; ejecutar `node --env-file=apps/api/.env.local scripts/check-db-backup.mjs`. Para ideas: `node --env-file=apps/api/.env.local packages/db/node_modules/tsx/dist/cli.mjs apps/api/scripts/check-idea-saves.ts`. Ambos comprueban el host QA antes de escribir.
- Vitest con tiempo de hook: `pnpm --filter api exec vitest run ARCHIVO --hookTimeout 30000`, no pasar la opción a `pnpm test` directamente. Algunas ejecuciones Node/Prisma necesitan escalación del sandbox de Windows; no es motivo para cambiar código.

## Continuación tras compactar

Mensaje sugerido: «Lee docs/CONTINUIDAD-ATELIER-2026-09-09.md y continúa preparando el piloto, empezando por IA y control de gasto. Conserva el acceso actual de iPhone y la sencillez para los chefs».

El usuario realizará la compactación. Este trabajo guarda el punto de continuación; no compacta por sí mismo ni modifica la memoria culinaria de los restaurantes.
