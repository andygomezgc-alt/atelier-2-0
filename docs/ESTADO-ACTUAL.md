# Estado actual de Atelier — 23 de septiembre de 2026

Punto de entrada al retomar el proyecto. **El 22 y 23 de septiembre el chat Creativo pasó de Opus 5 a Opus 5.5**, con esfuerzo medio y aviso legible si el proveedor rechaza una consulta. Solo cambió el servidor; los motivos, la comparación real y cómo volver atrás están en [Creativo con Opus 5.5](OPUS-5-5-2026-09-22.md). Entre el 15 y el 17 de septiembre: pruebas de integración de memoria en CI, escáner con excepciones caducables, Vercel revisado y vistas previas apagadas, **arreglado el cierre al abrir la app en iPhone**, restaurado el **arranque obligatorio** de crear o unirse a un restaurante y **revisada la matriz de permisos por rol** con el usuario. Detalle, identificadores y receta de entrega en [Ronda móvil y permisos](RONDA-MOVIL-Y-PERMISOS-2026-09-17.md); memoria culinaria en [sus correcciones](CORRECCIONES-MEMORIA-2026-09-13.md). No activar cobros. La ronda de arreglos móviles sigue abierta: el usuario pidió no hornear más binarios hasta avisar.

## Código y trabajo guardado

- Carpeta original: `C:/Users/Utente/Desktop/atelier-2-0`.
- Repositorio: `https://github.com/andygomezgc-alt/atelier-2-0`, rama de trabajo `main`.
- Código publicado: `d8baa60` (`merge: chat Creativo con Opus 5.5 en esfuerzo medio (PR #6)`), desplegado el 23-09 como `dpl_DZsjN6qqrivmHUJhenUwbzsAAAYB`, con la salud en 200. Sobre `e305004` (memoria culinaria, parches de dependencias y autenticación, arreglo del cierre en iPhone, arranque obligatorio y matriz de permisos nueva) añade el Creativo con Opus 5.5. CI en verde.
- Pruebas de integración de memoria sobre PostgreSQL real en `apps/api/lib/culinary-memory/memory.integration.test.ts` (15 casos: reserva concurrente, triggers, reintento, recuperación, retención, borrado, papelera y huellas antiguas). CI las ejecuta contra su Postgres; `pnpm test` no las incluye. Solo aceptan bases en localhost o un host de pruebas escrito expresamente; nunca producción.
- Escáner de dependencias: siete avisos aceptados con motivo y caducidad **15-12-2026** en `osv-scanner.toml` (herramientas de build/pruebas, sin arreglo compatible). Cualquier aviso nuevo pone CI en rojo.
- Se consolidan mejoras del piloto acumuladas: guardado e historial del chat, memoria culinaria, costes y productos, menú y PDF multirrestaurante, permisos, modelos de IA, cuotas y presupuesto, copias cifradas, privacidad y distribución móvil.
- Landing preparada para presentar Atelier y solicitar acceso por correo. Diseño aprobado por el usuario. `/` y `/pro` comparten la presentación. Ejemplo visual de demostración; no se presenta como captura real.
- Oferta propuesta: Pro a 49 €/mes más IVA; fundador a 24,50 €/mes más IVA durante los primeros tres meses de suscripción, luego tarifa normal. No descuento perpetuo.
- Backend de pagos preparado: checkout y portal de administrador, validación de precio/cupón, confirmación de pago real y webhook resistente a reentregas y eventos antiguos. `BILLING_CHECKOUT_ENABLED` permanece apagado por defecto. [Alcance y pendientes de pagos](PREPARACION-PAGOS-2026-09-12.md).
- Los archivos de claves, variables privadas, firma de apps, bases de datos, copias, diagnósticos y artefactos temporales se conservan localmente y se excluyen del repositorio.

## Producción y distribución comprobadas

- API pública: `https://atelier-2-0-mu.vercel.app`. Último despliegue verificado: `dpl_DZsjN6qqrivmHUJhenUwbzsAAAYB` (23 de septiembre, Creativo con Opus 5.5), al que apunta el dominio público. `/api/health` devuelve HTTP 200 y la migración de memoria está aplicada. El anterior verificado fue `dpl_3N5eiTeGEywzzSKn2UVPKpikzfzi` (14 de septiembre: memoria, autenticación y parches de ejecución).
- Vercel, verificado el 15 de septiembre con la sesión de la CLI: plan Hobby, Fluid Compute activo, límite de 300 segundos por función y Node 24, así que el cron de memoria dispone de sus 300 segundos. Solo `main` despliega (`git.deploymentEnabled` en `apps/api/vercel.json`): las vistas previas de ramas fallaban desde julio porque su entorno no tiene `DATABASE_URL`, y CI ya valida cada PR. Ese mismo día las claves de Apple quedaron solo en Production y el acceso al almacén de fotos en Production y Development (valor comprobado intacto); Preview ya no guarda ninguna variable.
- Android 0.1.0, versionCode **6** (commit `e305004`, EAS `63734b36-9f7e-4157-8b89-c4021821daef`): [APK](https://expo.dev/artifacts/eas/bt8AcEIWIYTadfOiTt-AY5nbBVVRwMqcPzygyy5voAA.apk), 111.361.686 bytes, descarga comprobada. **Es el enlace bueno para los chefs Android.**
- iPhone 0.1.0, build **12** (commit `e305004`, EAS `30031daf-f36c-49b8-9505-7295276f341c`, Apple `2a6f5618-ec5d-42c6-9d91-874542900d25`): en los grupos Equipo y Chefs e `IN_BETA_TESTING` desde el 17-09. **El [enlace público](https://testflight.apple.com/join/kY83jmnk) ya la sirve**, con los permisos nuevos. La build 9 y anteriores se cierran al abrir: no repartirlas.
- Historia de las builds 10 a 12 (cierre al arrancar, arranque obligatorio y permisos), con causas y evidencias: [Ronda móvil y permisos](RONDA-MOVIL-Y-PERMISOS-2026-09-17.md).
- No hace falta reconstruir las apps por los cambios de la landing o por guardar el repositorio. La prueba física con los chefs sigue siendo necesaria.
- Acceso actual conservado: Android Google; iPhone Apple y Google. Creador del restaurante administrador; invitado Lector hasta que el administrador cambie su categoría.
- Permisos por rol, revisados con el usuario el **17-09-2026** (`packages/shared/src/permissions.ts`, exigidos también en el servidor): **exportar PDF** (recetas, recetario, menú, productos) solo admin y chef ejecutivo; **chat Creativo** solo admin y chef ejecutivo, el sous-chef usa el Diario; **el Lector ve y abre recetas** pero no las edita ni exporta; **el sous-chef ya no crea ni edita menús**. Sin cambios: crear restaurante da admin, unirse con código da Lector, y solo el admin cambia roles. «Nuestra cocina» pasó a exigir `capture_idea` para que el Lector siga sin acceder.

## IA y copias

- Piloto inicial de unos cinco chefs, presupuesto común de **50 EUR para un mes**, 140 mensajes cotidianos y 8 creativos por chef y periodo de siete días. La cuenta principal está exenta de la cuota de mensajes, pero consume el mismo presupuesto común.
- Modelos elegidos: Gemini para el Diario, **Opus 5.5 para el Creativo** (`claude-opus-5-5`, esfuerzo medio, desde el 23-09) y GLM para las otras tareas compatibles. En producción, el modelo del Creativo lo fija `AI_CHAT_CREATIVE_MODEL` en Vercel, y la contabilidad del presupuesto rechaza cualquier modelo sin tarifa registrada en `apps/api/lib/ai/budget-policy.ts`. No cambiar proveedores ni gastar tokens para una sincronización.
- Copia diaria cifrada activa a las 09:00 de Italia. La primera ejecución por horario del 12 de septiembre creó `atelier-2026-09-12T07-01-29-659Z-05586979.atbak` (1.941.037 bytes); archivo y manifiesto observados en Drive y estado `cloud_confirmed` a las 07:02:41 UTC. Se conservan cuatro copias; no hay borrado automático durante el piloto.
- Clave de recuperación custodiada por separado en Google Password Manager; nunca incluirla en Git ni en Drive junto a las copias. [Operación de copias](COPIAS-DIARIAS-2026-09-11.md).

## Comprobaciones al guardar el estado

- 15 de septiembre: TypeScript de API correcto; API 704/704, móvil 148/148 y contratos 253/253. Integración de memoria 15/15 sobre la base de **pruebas** (tras aplicarle la migración `20260913010000_culinary_memory_reliability`, ya presente en producción), sin restos de datos al terminar. Se comprobó que las pruebas detectan fallos: al reintroducir el título y el estado en la huella falla la de aprobar/renombrar, y al quitar la condición de la reserva falla la de concurrencia.
- 12 de septiembre: TypeScript correcto en base de datos, idiomas, contratos compartidos, API y móvil.
- 1.082 pruebas pasadas sumando API (676), móvil (148), contratos (253) e idiomas (5). La ejecución conjunta agotó el tiempo de inicialización de dos grupos de API; sus 16 pruebas pasaron al repetirse de forma aislada. No se cambió el código para ocultar esos tiempos de espera.
- Revisión del contenido preparado para Git sin coincidencias de claves locales ni credenciales reales; los ejemplos ficticios de `.env.example` se conservaron.
- Git local y remoto partían del mismo commit `8af2105`. Se conserva el historial existente; no hay force-push ni limpieza de archivos de trabajo.

## El piloto ya arrancó (comprobado el 17-09 en producción, solo lectura)

- **Equipo de Kokoo: 5 personas.** Andy (admin), «cripto usuario» (admin), Gaia (chef ejecutivo), **Mariasole Ricci (sous-chef, entró el 16-09)** y **Eugenio Sanchote (Lector, entró el 17-09)**. El recorrido de unirse con código y el de que el admin cambie el rol están probados por personas reales, no solo por pruebas.
- **Gaia ya usa su cuenta de Google** (sesión del 16-09 a las 21:44). Su cuenta duplicada y vacía creada con Apple sigue existiendo (`cmu4e2b770000l1047tuti7k4`): borrarla es opcional.
- **Presupuesto de IA en marcha:** periodo **16-09 a 16-10-2026**, gastado 0,01 € de 50 €. Tres generaciones: dos del chat Diario y una extracción con GLM.
- **Anthropic: 23,84 USD de créditos** el 17-09 (se cargaron 20). Desde entonces se conocen dos gastos: 0,07 $ de una respuesta del Creativo el 18-09 y 0,93 $ de la comparación del 22-09. La recarga automática sigue desactivada, así que el Creativo se detiene al agotarse. Con el coste medido en la comparación, las 160 respuestas al mes del escenario del piloto costarían unos 9,4 $ con Opus 5.5, frente a 15,4 $ con Opus 5; la estimación antigua de 29 $ suponía respuestas mucho más largas.

## Pendiente

- Comprobar en producción, en solo lectura, la primera respuesta real del Creativo con Opus 5.5: debe guardar `modelId = claude-opus-5-5` y cobrarse con su tarifa. Si hiciera falta volver atrás, basta con el «Instant Rollback» de Vercel.
- Que los chefs actualicen a la build 12 desde TestFlight (Android, al APK versionCode 6): hasta entonces una app vieja muestra botones que el servidor ya rechaza.
- Decidir si se simplifica la coordinación del aprendizaje nocturno. Recomendación: dejarla mientras funcione; las pruebas de integración permiten simplificarla después sin trabajar a ciegas.
- Antes del 15-12-2026, revisar las excepciones de `osv-scanner.toml`. Actualizar vitest a la versión 3 elimina dos.

## Siguiente fase cuando el usuario decida continuar

1. Prueba real del piloto Android/iPhone: acceso, equipo, chat, recetas, costes, memoria y escaneo de distintos menús, con los permisos nuevos por rol.
2. Recorrido web autenticado del administrador para contratar/cancelar, conservando los accesos móviles existentes.
3. Configuración e integración completa en Stripe de prueba: tres meses de descuento, tarifa normal en el cuarto, cancelación, impagos y reintentos. No hay compra real validada todavía.
4. Condiciones y límites comerciales definitivos con datos de consumo del piloto; revisión fiscal y del recorrido de compra por plataforma antes de vender.

Los documentos fechados conservan el historial. Este archivo y las notas posteriores prevalecen sobre sus pendientes antiguos.
