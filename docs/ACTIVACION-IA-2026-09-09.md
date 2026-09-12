# Activación de proveedores — 9 de septiembre de 2026

Última publicación del servidor, 17:27 UTC: `dpl_9xELXJ3xMUFBLAUC6wjJ4TVGEaY7` activo, con títulos del historial a partir del primer mensaje y todas las correcciones previas. Compilación y salud correctas. Véase [Nuevo chat](NUEVO-CHAT-2026-09-09.md) para el APK de esta mejora; el resto de este documento registra la activación y sus actualizaciones anteriores.

Actualización anterior del servidor, 13:51 UTC: publicado `dpl_ChoCyN7j4mruneQ7pqvN6YijnVvi`, con normalización de respuestas GLM al convertir recetas y diagnóstico seguro. Véase [Incidencia de guardado](INCIDENCIA-GUARDADO-2026-09-09.md). Incluye las mejoras de memoria descritas a continuación; el APK sigue siendo válido.

Actualización posterior del mismo día: publicadas las correcciones de calidad de memoria en `dpl_7xKYCr2dukLoCLg6AqXqd6noL6rG`. El APK existente continúa siendo válido. Véase [Validación de memoria](VALIDACION-MEMORIA-2026-09-09.md) para pruebas reales, estado actual y la observación pendiente del cron en producción. El despliegue de activación registrado más abajo es el anterior.

Activación completada en producción y APK Android terminado. El usuario autorizó configurar y activar los proveedores y preparar la app. Al retomar el trabajo, Z.AI ya mostraba el paquete comprado y activo; el agente no ejecutó ningún pago. No se guardan claves en este documento.

## Estado comprobado

- Clave Gemini «Atelier» creada en Google AI Studio, dentro del proyecto existente `gen-lang-client-0628677395`, tras importarlo. Una llamada real con el adaptador de Atelier a `gemini-3.8-flash` respondió correctamente: 16 tokens de entrada y 1 de salida. Continúa en el nivel gratuito; no se activó facturación.
- Clave GLM aportada por el usuario y configurada localmente y en producción. Inicialmente devolvía HTTP 429, código `1113`, por falta de saldo. El 9 de septiembre se comprobó en la cuenta un paquete activo de 100 millones de tokens para `glm-5.3-flash`, con vencimiento el 9 de diciembre de 2026. Una petición mínima real respondió HTTP 200, JSON válido y finalización `stop`: 83 tokens de entrada y 161 de salida, incluidos 150 de razonamiento.
- La clave local de Anthropic devuelve HTTP 401. La clave ya existente en producción supera el diagnóstico de autenticación `/api/health?deep=1`; se conserva y no se sobrescribe con la local. Este diagnóstico acredita autenticación, no una generación real con Opus 5.
- `GEMINI_API_KEY` y `ZAI_API_KEY` añadidas como variables sensibles de producción en Vercel. Modelos fijados mediante `AI_CHAT_DAILY_MODEL`, `AI_CHAT_CREATIVE_MODEL` y `AI_GLM_MODEL`. Archivo local: `apps/api/.env.local`, excluido de Git y de los paquetes de despliegue.
- La revisión automática rechazó descargar todas las variables de producción. No se descargaron; se sustituyó esa acción por el diagnóstico público del servidor y la escritura de las variables específicas de IA.

## Despliegue publicado

Proyecto Vercel: `atelier-2-0` (`prj_knDXYv368VqkyzMvSpMz8tym5vwD`). Raíz `apps/api`.

Producción anterior: `dpl_DvFZDUYo2BugGBjXtx8G8HwsaooU`, URL `https://atelier-2-0-3dkuaiagq-andygomezgc-alts-projects.vercel.app`. Dominio del APK: `https://atelier-2-0-mu.vercel.app`.

Despliegue `dpl_7uegDpUua2UxwRJr6Gguk5NfzfpH`, URL `https://atelier-2-0-kfvp54ps8-andygomezgc-alts-projects.vercel.app`. Se preparó con `--prod --skip-domain`, se verificó su salud con el acceso autenticado del CLI de Vercel y después se promovió al dominio del APK. La comprobación pública final, el 9 de septiembre de 2026 a las 06:12 UTC, devolvió HTTP 200 y `status: ok`, con base de datos, autenticación Anthropic, configuración Gemini/Z.AI y Resend correctos.

La compilación y creación de funciones en Linux terminaron correctamente. El comprobador antiguo de Prisma sigue emitiendo su aviso al buscar un motor físicamente dentro de `.next`; el diagnóstico real del servidor confirma que Prisma conecta y consulta la base. La fidelidad visual del escaneo con GLM y la ejecución completa de PDF en el dispositivo siguen formando parte de la prueba de uso.

Los registros de Vercel confirman que se aplicaron correctamente las cuatro migraciones pendientes en la base de producción `ep-red-haze`: revisión de alérgenos, guardados y turnos de chat fiables, unidades y versiones de menú, y memoria culinaria. Son cambios compatibles con el servidor anterior. El retroceso de despliegue no revierte las migraciones.

## Android

Actualización posterior de «Nuevo chat»: build `2361ab2e-d4ff-457c-b4b9-a7f8055c239a`, `FINISHED` el 9 de septiembre a las 18:40:26 UTC, `versionCode: 3`. [APK actual](https://expo.dev/artifacts/eas/JLApXEBBVGj_k2_IbwKod0APLaFTVv6k-A94dmQkWJs.apk), HTTP 200 y 111.355.754 bytes verificados. Los párrafos siguientes documentan el APK anterior de activación.

El perfil EAS `pilot` genera un APK interno, conserva la firma Android existente y apunta al dominio de producción. Se añadió `autoIncrement` para que la actualización tenga un código de versión superior. EAS incrementó `versionCode` de 1 a 2. Versión visible `0.1.0`, Android `com.atelier.app`, Expo SDK 56.

Build `5faac929-7aeb-460f-8d49-922b9bfffa6e`, estado `FINISHED`, terminado el 8 de septiembre de 2026 a las 22:26 UTC. Se compiló el contenido del directorio de trabajo, incluidas las mejoras aún no confirmadas en Git; la etiqueta de commit de EAS corresponde al HEAD existente.

- [Página del build](https://expo.dev/accounts/andygome/projects/atelier/builds/5faac929-7aeb-460f-8d49-922b9bfffa6e).
- [Descarga del APK](https://expo.dev/artifacts/eas/U5XCd5RUbY5rLt1Q1usiQu6Q6r5Hy3_PqISxct-SBTY.apk). Comprobado HTTP 200 y 111.346.374 bytes. EAS informa caducidad de esta distribución el 22 de septiembre de 2026.

## Alcance de la verificación

La activación técnica está terminada. Se conservan las 943 pruebas locales de la implementación, la exportación Android y los resultados de compilación, migración y salud. La comparación culinaria dentro de la app, el escaneo completo y la instalación y uso físico del nuevo APK quedan para la prueba del usuario. La memoria está disponible y conserva la opción de aprendizaje elegida por cada restaurante; no se activó indiscriminadamente para todos los equipos.

El límite «1 por usuario» del paquete GLM aparece en el checkout como máximo de una unidad por cuenta compradora. Las [condiciones adicionales de la API](https://docs.z.ai/legal-agreement/terms-of-use) permiten integrarla en aplicaciones para usuarios finales. La cuota se comparte entre las peticiones del servidor de Atelier; los datos y memorias conservan su separación por restaurante.
