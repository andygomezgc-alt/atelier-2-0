# Estado actual de Atelier — 14 de septiembre de 2026

Punto de entrada al retomar el proyecto. El usuario autorizó **corregir y publicar los seis pasos de la auditoría de memoria culinaria** con GPT-5.6 Sol en ultra. La implementación y la migración están publicadas y verificadas en producción. No activar cobros ni ampliar funciones ajenas a la memoria. [Correcciones y validación de memoria](CORRECCIONES-MEMORIA-2026-09-13.md).

## Código y trabajo guardado

- Carpeta original: `C:/Users/Utente/Desktop/atelier-2-0`.
- Repositorio: `https://github.com/andygomezgc-alt/atelier-2-0`, rama de trabajo `main`.
- Último commit consolidado/publicado: `6d22033` (`fix(auth): update Prisma adapter security patch`). Incluye los parches de memoria, dependencias de ejecución y autenticación; `origin/main` está sincronizado.
- Se consolidan mejoras del piloto acumuladas: guardado e historial del chat, memoria culinaria, costes y productos, menú y PDF multirrestaurante, permisos, modelos de IA, cuotas y presupuesto, copias cifradas, privacidad y distribución móvil.
- Landing preparada para presentar Atelier y solicitar acceso por correo. Diseño aprobado por el usuario. `/` y `/pro` comparten la presentación. Ejemplo visual de demostración; no se presenta como captura real.
- Oferta propuesta: Pro a 49 €/mes más IVA; fundador a 24,50 €/mes más IVA durante los primeros tres meses de suscripción, luego tarifa normal. No descuento perpetuo.
- Backend de pagos preparado: checkout y portal de administrador, validación de precio/cupón, confirmación de pago real y webhook resistente a reentregas y eventos antiguos. `BILLING_CHECKOUT_ENABLED` permanece apagado por defecto. [Alcance y pendientes de pagos](PREPARACION-PAGOS-2026-09-12.md).
- Los archivos de claves, variables privadas, firma de apps, bases de datos, copias, diagnósticos y artefactos temporales se conservan localmente y se excluyen del repositorio.

## Producción y distribución comprobadas antes de esta sincronización

- API pública: `https://atelier-2-0-mu.vercel.app`. Despliegue verificado: `dpl_3N5eiTeGEywzzSKn2UVPKpikzfzi` (14 de septiembre, memoria, autenticación y parches de ejecución). `/api/health` devuelve HTTP 200; la migración de memoria está aplicada.
- Android 0.1.0, versionCode **4**, build EAS `782dbc73-f0db-45f3-9034-819726775775` terminado. [APK](https://expo.dev/artifacts/eas/HYTsna9LezSg-EbPdwDpywLo1mLNPA9Wd5DG3ebHWEY.apk).
- iPhone 0.1.0, build **9**, revisión beta aprobada e `IN_BETA_TESTING` para Chefs. [TestFlight público](https://testflight.apple.com/join/kY83jmnk).
- No hace falta reconstruir las apps por los cambios de la landing o por guardar el repositorio. La prueba física con los chefs sigue siendo necesaria.
- Acceso actual conservado: Android Google; iPhone Apple y Google. Creador del restaurante administrador; invitado Lector hasta que el administrador cambie su categoría.

## IA y copias

- Piloto inicial de unos cinco chefs, presupuesto común de **50 EUR para un mes**, 140 mensajes cotidianos y 8 creativos por chef y periodo de siete días. La cuenta principal está exenta de la cuota de mensajes, pero consume el mismo presupuesto común.
- Modelos elegidos: Gemini y Opus para chat, GLM para las otras tareas compatibles. No cambiar proveedores ni gastar tokens para una sincronización.
- Copia diaria cifrada activa a las 09:00 de Italia. La primera ejecución por horario del 12 de septiembre creó `atelier-2026-09-12T07-01-29-659Z-05586979.atbak` (1.941.037 bytes); archivo y manifiesto observados en Drive y estado `cloud_confirmed` a las 07:02:41 UTC. Se conservan cuatro copias; no hay borrado automático durante el piloto.
- Clave de recuperación custodiada por separado en Google Password Manager; nunca incluirla en Git ni en Drive junto a las copias. [Operación de copias](COPIAS-DIARIAS-2026-09-11.md).

## Comprobaciones al guardar el estado

- TypeScript correcto en base de datos, idiomas, contratos compartidos, API y móvil.
- 1.082 pruebas pasadas sumando API (676), móvil (148), contratos (253) e idiomas (5). La ejecución conjunta agotó el tiempo de inicialización de dos grupos de API; sus 16 pruebas pasaron al repetirse de forma aislada. No se cambió el código para ocultar esos tiempos de espera.
- Revisión del contenido preparado para Git sin coincidencias de claves locales ni credenciales reales; los ejemplos ficticios de `.env.example` se conservaron.
- Git local y remoto partían del mismo commit `8af2105`. Se conserva el historial existente; no hay force-push ni limpieza de archivos de trabajo.

## Siguiente fase cuando el usuario decida continuar

1. Prueba real del piloto Android/iPhone: acceso, equipo, chat, recetas, costes, memoria y escaneo de distintos menús. Las correcciones actuales son de servidor y no requieren reconstruir las apps.
3. Recorrido web autenticado del administrador para contratar/cancelar, conservando los accesos móviles existentes.
4. Configuración e integración completa en Stripe de prueba: tres meses de descuento, tarifa normal en el cuarto, cancelación, impagos y reintentos. No hay compra real validada todavía.
5. Condiciones y límites comerciales definitivos con datos de consumo del piloto; revisión fiscal y del recorrido de compra por plataforma antes de vender.

Los documentos fechados conservan el historial. Este archivo y las notas posteriores prevalecen sobre sus pendientes antiguos.
