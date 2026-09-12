# Actualización móvil — 11 de septiembre de 2026

> **Cierre 11-09-2026, 21:24 UTC:** privacidad y eliminación publicadas en `dpl_EH6DcTAhVXfHpCYsfKaVAduq8CeP`, salud correcta. Apple confirmó build 9 APPROVED e IN_BETA_TESTING para Chefs; enlace público https://testflight.apple.com/join/kY83jmnk . La revisión externa ya NO está pendiente. Copias ACTIVE y prueba manual correcta; primera ejecución por horario aún pendiente de observar. [Cierre verificado](CIERRE-PRIVACIDAD-TESTFLIGHT-2026-09-11.md).

## Resultado confirmado

Ambas compilaciones finalizadas. Se usó el directorio actual con cambios acumulados, no el script antiguo que sincroniza un clon con origin/main. No se hicieron commits ni se sustituyeron cambios locales.

- Android: versión 0.1.0, versionCode 4, build `782dbc73-f0db-45f3-9034-819726775775`, FINISHED a las 15:07:40 UTC. APK: https://expo.dev/artifacts/eas/HYTsna9LezSg-EbPdwDpywLo1mLNPA9Wd5DG3ebHWEY.apk . Descarga comprobada HTTP 200, 111.365.158 bytes. Conserva `com.atelier.app` y el keystore remoto anterior.
- iPhone: versión 0.1.0, buildNumber 9, build `7da7de80-2a2c-4fc8-82bd-518395ccc048`, FINISHED a las 14:26:29 UTC. Envío `d17fe930-2b14-412d-88b9-4e05985db7fd` FINISHED. App Store Connect confirmó build `05015cc6-03f3-4cae-a35b-6467ae8aa80e`, procesamiento VALID, grupo interno Equipo, estado IN_BETA_TESTING. Caduca el 10-12-2026. Conserva `com.atelierchef.app`, firma y Apple/Google.
- **Distribución externa pendiente:** Apple devuelve READY_FOR_BETA_SUBMISSION. No se solicitó revisión externa ni se enviaron invitaciones nuevas. El grupo interno existente tenía acceso automático a todos los builds y autoNotifyEnabled; se conservaron esos ajustes.

## Validación y credenciales

148 pruebas móviles superadas. Tipos de todos los paquetes ya comprobados en la publicación del servidor. Exportación local completada: Android 2.293 módulos e iOS 2.214, en `output/pilot-release-mobile`; se exportó también web por usar `--platform all`. Esto no sustituye una prueba física.

Perfil iOS inspeccionado sin mostrar secretos: aplicación TU6284T7J8.com.atelierchef.app, acceso Apple Default y vencimiento 20-07-2027. Se creó `apps/mobile/credentials.json` ignorado por Git/EAS/Vercel, reutilizando la configuración de credenciales existente del clon atelier-bake y referencias absolutas a los archivos originales de atelier-secretos. No se generaron ni renovaron certificados, claves ni perfiles. No imprimir ese archivo.

EAS incrementó las versiones remotas 3→4 y 8→9. Los perfiles conservaron API de producción, clientes Google y configuración Sentry. No se compró una mejora de cola. Las compilaciones incluyen presupuesto en Perfil, cuotas semanales y cola de ideas sin conexión; el servidor ya se publicó en `dpl_FfUPJPPNuKeYbfjQFFzqDcx9TUXB`.

## Prueba siguiente

Android: instalar el APK como actualización de Atelier existente, sin desinstalar. iPhone: actualizar Atelier desde TestFlight con una cuenta del grupo interno Equipo. Probar entrada, datos conservados, Perfil principal, ambos chats, Nuevo chat, guardado de receta/costes y una idea con corte de red. Antes de invitar a chefs externos: privacidad, prueba de escaneo multirrestaurante y revisión beta de Apple. No confundir envío terminado con aprobación externa.

Herramientas de lectura preparadas en output: `check-mobile-delivery.cjs` consulta únicamente los dos builds y el envío existentes con la sesión EAS; `check-testflight-release.cjs` consulta build 9 en ASC con la clave existente, sin imprimir JWT ni claves. No volver a lanzar builds para consultar estado.
