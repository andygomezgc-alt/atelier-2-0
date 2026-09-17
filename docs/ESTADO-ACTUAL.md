# Estado actual de Atelier — 15 de septiembre de 2026

Punto de entrada al retomar el proyecto. El usuario autorizó **corregir y publicar los seis pasos de la auditoría de memoria culinaria** con GPT-5.6 Sol en ultra. La implementación y la migración están publicadas y verificadas en producción. El 15 de septiembre se cerraron los cabos sueltos que no dependen del usuario: pruebas de integración en CI, excepciones del escáner con caducidad, configuración de Vercel verificada y vistas previas de ramas apagadas. No activar cobros ni ampliar funciones ajenas a la memoria. [Correcciones y validación de memoria](CORRECCIONES-MEMORIA-2026-09-13.md).

## Código y trabajo guardado

- Carpeta original: `C:/Users/Utente/Desktop/atelier-2-0`.
- Repositorio: `https://github.com/andygomezgc-alt/atelier-2-0`, rama de trabajo `main`.
- Código de la app publicado: `6d22033` (`fix(auth): update Prisma adapter security patch`). Incluye los parches de memoria, dependencias de ejecución y autenticación. Los commits posteriores son de documentación, pruebas, CI y configuración de despliegue, sin cambios en la app.
- Pruebas de integración de memoria sobre PostgreSQL real en `apps/api/lib/culinary-memory/memory.integration.test.ts` (15 casos: reserva concurrente, triggers, reintento, recuperación, retención, borrado, papelera y huellas antiguas). CI las ejecuta contra su Postgres; `pnpm test` no las incluye. Solo aceptan bases en localhost o un host de pruebas escrito expresamente; nunca producción.
- Escáner de dependencias: siete avisos aceptados con motivo y caducidad **15-12-2026** en `osv-scanner.toml` (herramientas de build/pruebas, sin arreglo compatible). Cualquier aviso nuevo pone CI en rojo.
- Se consolidan mejoras del piloto acumuladas: guardado e historial del chat, memoria culinaria, costes y productos, menú y PDF multirrestaurante, permisos, modelos de IA, cuotas y presupuesto, copias cifradas, privacidad y distribución móvil.
- Landing preparada para presentar Atelier y solicitar acceso por correo. Diseño aprobado por el usuario. `/` y `/pro` comparten la presentación. Ejemplo visual de demostración; no se presenta como captura real.
- Oferta propuesta: Pro a 49 €/mes más IVA; fundador a 24,50 €/mes más IVA durante los primeros tres meses de suscripción, luego tarifa normal. No descuento perpetuo.
- Backend de pagos preparado: checkout y portal de administrador, validación de precio/cupón, confirmación de pago real y webhook resistente a reentregas y eventos antiguos. `BILLING_CHECKOUT_ENABLED` permanece apagado por defecto. [Alcance y pendientes de pagos](PREPARACION-PAGOS-2026-09-12.md).
- Los archivos de claves, variables privadas, firma de apps, bases de datos, copias, diagnósticos y artefactos temporales se conservan localmente y se excluyen del repositorio.

## Producción y distribución comprobadas

- API pública: `https://atelier-2-0-mu.vercel.app`. Despliegue verificado: `dpl_3N5eiTeGEywzzSKn2UVPKpikzfzi` (14 de septiembre, memoria, autenticación y parches de ejecución). `/api/health` devuelve HTTP 200; la migración de memoria está aplicada. Los despliegues posteriores publican el mismo código de la app.
- Vercel, verificado el 15 de septiembre con la sesión de la CLI: plan Hobby, Fluid Compute activo, límite de 300 segundos por función y Node 24, así que el cron de memoria dispone de sus 300 segundos. Solo `main` despliega (`git.deploymentEnabled` en `apps/api/vercel.json`): las vistas previas de ramas fallaban desde julio porque su entorno no tiene `DATABASE_URL`, y CI ya valida cada PR. Ese mismo día las claves de Apple quedaron solo en Production y el acceso al almacén de fotos en Production y Development (valor comprobado intacto); Preview ya no guarda ninguna variable.
- Android 0.1.0, versionCode **5**, build EAS `f9029e51-ebb1-4461-b659-08075e54f241` (commit `d36383d`). [APK](https://expo.dev/artifacts/eas/cbFCRLgcXzXES2bgLQix8e7jt_hOSsAthYoXbJakKps.apk), 111.365.214 bytes, descarga comprobada. Sustituye al versionCode 4 (`782dbc73`), que no traía el arranque obligatorio.
- iPhone 0.1.0, build **11** (EAS `8f42657e-d86a-4fc1-a7f2-279b811d9b1f`, Apple `a6b96744-5f76-445b-b4c1-280eaa1c14b9`, commit `d36383d`), procesada, en los grupos Equipo y Chefs e `IN_BETA_TESTING` desde el 17-09-2026. [TestFlight público](https://testflight.apple.com/join/kY83jmnk), el mismo enlace de siempre. La build 10 sigue disponible y la 9 está rota.
- Por qué existen las builds 10 y 11. **(a) Cierre al abrir, desde la build 7**. `useAuth.ts` cargaba React Native con un import dinámico y, al recorrer sus exportaciones, evaluaba el getter obsoleto `PushNotificationIOS`, cuyo `NativeEventEmitter` sin módulo nativo es fatal **solo en iOS**; Android no hace esa comprobación, por eso el APK siempre funcionó. Sentry lo registró 27 veces en 4 personas desde julio. Corregido con import nombrado y una prueba que impide reintroducirlo; **confirmado en un iPhone real el 16-09** (abre bien; Sentry no registró ningún cierre desde la build 10). **(b) Primer arranque sin restaurante**: A-12 había quitado el paso obligatorio de crear o unirse, así que el chef caía en Inicio, donde `/api/ideas` responde 403 y la pantalla lo pinta como «Sin conexión». Restaurado el 16-09: sin restaurante se va a crear o unirse con código, con la regla extraída a `nextRoute` y probada. Los roles no cambiaron: crear = admin, unirse con código = Lector, y solo el admin cambia roles.
- No hace falta reconstruir las apps por los cambios de la landing o por guardar el repositorio. La prueba física con los chefs sigue siendo necesaria.
- Acceso actual conservado: Android Google; iPhone Apple y Google. Creador del restaurante administrador; invitado Lector hasta que el administrador cambie su categoría.
- Permisos por rol, revisados con el usuario el **17-09-2026** (`packages/shared/src/permissions.ts`, exigidos también en el servidor): **exportar PDF** (recetas, recetario, menú, productos) solo admin y chef ejecutivo; **chat Creativo** solo admin y chef ejecutivo, el sous-chef usa el Diario; **el Lector ve y abre recetas** pero no las edita ni exporta; **el sous-chef ya no crea ni edita menús**. Sin cambios: crear restaurante da admin, unirse con código da Lector, y solo el admin cambia roles. «Nuestra cocina» pasó a exigir `capture_idea` para que el Lector siga sin acceder.

## IA y copias

- Piloto inicial de unos cinco chefs, presupuesto común de **50 EUR para un mes**, 140 mensajes cotidianos y 8 creativos por chef y periodo de siete días. La cuenta principal está exenta de la cuota de mensajes, pero consume el mismo presupuesto común.
- Modelos elegidos: Gemini y Opus para chat, GLM para las otras tareas compatibles. No cambiar proveedores ni gastar tokens para una sincronización.
- Copia diaria cifrada activa a las 09:00 de Italia. La primera ejecución por horario del 12 de septiembre creó `atelier-2026-09-12T07-01-29-659Z-05586979.atbak` (1.941.037 bytes); archivo y manifiesto observados en Drive y estado `cloud_confirmed` a las 07:02:41 UTC. Se conservan cuatro copias; no hay borrado automático durante el piloto.
- Clave de recuperación custodiada por separado en Google Password Manager; nunca incluirla en Git ni en Drive junto a las copias. [Operación de copias](COPIAS-DIARIAS-2026-09-11.md).

## Comprobaciones al guardar el estado

- 15 de septiembre: TypeScript de API correcto; API 704/704, móvil 148/148 y contratos 253/253. Integración de memoria 15/15 sobre la base de **pruebas** (tras aplicarle la migración `20260913010000_culinary_memory_reliability`, ya presente en producción), sin restos de datos al terminar. Se comprobó que las pruebas detectan fallos: al reintroducir el título y el estado en la huella falla la de aprobar/renombrar, y al quitar la condición de la reserva falla la de concurrencia.
- 12 de septiembre: TypeScript correcto en base de datos, idiomas, contratos compartidos, API y móvil.
- 1.082 pruebas pasadas sumando API (676), móvil (148), contratos (253) e idiomas (5). La ejecución conjunta agotó el tiempo de inicialización de dos grupos de API; sus 16 pruebas pasaron al repetirse de forma aislada. No se cambió el código para ocultar esos tiempos de espera.
- Revisión del contenido preparado para Git sin coincidencias de claves locales ni credenciales reales; los ejemplos ficticios de `.env.example` se conservaron.
- Git local y remoto partían del mismo commit `8af2105`. Se conserva el historial existente; no hay force-push ni limpieza de archivos de trabajo.

## Antes de invitar a los chefs (lo hace el usuario)

- Entrar con Google en un móvil contra el servidor actual. Sus piezas tienen pruebas, pero la ruta `/api/mobile/auth/google` no tiene prueba propia y ninguna prueba usa el Google real; en Android es el único acceso.
- Decidir si se simplifica la coordinación del aprendizaje nocturno. Recomendación: dejarla mientras funcione; las pruebas de integración permiten simplificarla después sin trabajar a ciegas.
- Antes del 15-12-2026, revisar las excepciones de `osv-scanner.toml`. Actualizar vitest a la versión 3 elimina dos.

## Siguiente fase cuando el usuario decida continuar

1. Prueba real del piloto Android/iPhone: acceso, equipo, chat, recetas, costes, memoria y escaneo de distintos menús. Las correcciones actuales son de servidor y no requieren reconstruir las apps.
2. Recorrido web autenticado del administrador para contratar/cancelar, conservando los accesos móviles existentes.
3. Configuración e integración completa en Stripe de prueba: tres meses de descuento, tarifa normal en el cuarto, cancelación, impagos y reintentos. No hay compra real validada todavía.
4. Condiciones y límites comerciales definitivos con datos de consumo del piloto; revisión fiscal y del recorrido de compra por plataforma antes de vender.

Los documentos fechados conservan el historial. Este archivo y las notas posteriores prevalecen sobre sus pendientes antiguos.
