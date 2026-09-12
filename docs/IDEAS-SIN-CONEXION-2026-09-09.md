# Guardado de ideas con reintentos — 9 de septiembre de 2026

> **Actualización del 11-09-2026, 14:06 UTC:** servidor y las tres migraciones de ideas/cuotas/presupuesto ya publicados en producción (`dpl_FfUPJPPNuKeYbfjQFFzqDcx9TUXB`). Dominio público y salud verificados. Pendientes las compilaciones Android/iPhone, el indicador en el teléfono y la prueba física. Clave externa ya custodiada en Google Password Manager; copia previa a esta publicación confirmada en Drive. Este estado sustituye las menciones históricas de «solo QA», «sin publicar» y «custodia pendiente» que siguen abajo. Detalle: [Publicación del piloto](PUBLICACION-PILOTO-2026-09-11.md).


## Estado

Implementado en el directorio de trabajo y verificado con pruebas locales y la base aislada de QA. **Pendiente publicar servidor, migración y APK**. El APK Android versión 3 y el despliegue de «Nuevo chat» siguen siendo los publicados; no incluyen esta corrección. No se inició otro build EAS.

## Problema reproducido

Si el servidor guardaba una idea pero se perdía la respuesta, Inicio generaba un identificador local después del envío. Al sincronizar la cola, el cliente enviaba solo el texto; el servidor creaba otra idea. La prueba de regresión produjo dos registros para un único envío. El POST también aceptaba peticiones retrasadas cuyo restaurante esperado ya había cambiado.

## Cambio

- El cliente genera y persiste el identificador **antes del primer POST**. Los reintentos, incluso tras reiniciar la app, reutilizan el identificador almacenado.
- Cada petición identifica al usuario y restaurante esperados. La API contrasta ambos con la sesión autenticada y rechaza un cambio de identidad antes de escribir. La cola mantiene su ámbito de usuario/restaurante.
- Un recibo transaccional identifica el guardado por restaurante, autor e identificador del envío. La restricción única resuelve también la concurrencia: la transacción que pierde revierte la idea provisional y devuelve la ya existente.
- El recibo conserva solo identificadores y un hash del texto original; no copia el contenido de la idea. Los reintentos devuelven su estado actual y preservan ediciones y archivo. Si la idea se eliminó, el recibo conserva la referencia nula y responde 410 para impedir su recreación. Se elimina al borrar el usuario o restaurante.
- Inicio bloquea el doble toque y conserva el texto ante fallos de persistencia o validación. Una confirmación recibida del servidor sigue contando como guardado aunque falle la limpieza local; el siguiente reintento usa el mismo identificador.
- Sin IA, configuraciones, pantallas nuevas ni pasos adicionales. Se puede guardar deliberadamente el mismo texto otra vez: cada acción nueva tiene otro identificador.

## Límites y compatibilidad

- El servidor sigue aceptando el contrato anterior sin identificador para APK ya instalados. Esa ruta anterior no tiene deduplicación; **actualizar primero el servidor y después el APK**.
- Se conserva el formato de cola v2, incluido su identificador local existente. Un envío anterior a esta actualización que ya llegó al servidor sin identificador no puede reconocerse retroactivamente. No borrar ni fusionar ideas por similitud del texto.
- La sincronización existente se ejecuta al volver a Inicio o actualizar la lista. No se añadió un servicio de sincronización continua en segundo plano.
- Los errores transitorios conservan la cola; errores terminales, incluida una idea ya eliminada, dejan de reintentarse. La política anterior de cierre de sesión explícito sigue limpiando datos locales; la expiración de sesión conserva las ideas pendientes de su propietario.
- Los recibos duran mientras exista la cuenta/restaurante, incluso si la idea se elimina; permiten reconocer reintentos tardíos. Son registros pequeños, sin contenido culinario en claro.

## Validación

- 23 pruebas de cola: persistencia previa al envío, respuesta perdida, lectura desde disco, operaciones simultáneas, fallos de almacenamiento, aislamiento y eliminación.
- 4 pruebas sobre la pantalla real Inicio con límites nativos simulados: doble toque, borrador conservado, cancelación de restaurante y cambio de identidad.
- 11 pruebas del POST: reintentos, conflicto de contenido, contratos anteriores, aislamiento y validación.
- También pasaron las otras 115 pruebas móviles, 253 de contratos compartidos y 5 de idiomas. La primera ejecución de la nueva prueba de pantalla necesitó completar el mock de Platform; corregida y superada.
- TypeScript correcto en API, móvil, contratos e idiomas. La comprobación móvil final incluye el nuevo archivo de prueba de Inicio.
- Exportación Android/Hermes correcta: 2.292 módulos, paquete local en `output/ideas-offline-android`. Esto no es un APK publicado.
- Grafo de código actualizado con `graphify update .`, sin IA: 3.058 nodos y 6.795 relaciones.
- Base PostgreSQL de QA: migración `20260909190000_retryable_ideas` aplicada y ensayo real con cinco peticiones concurrentes, una sola idea/recibo y cuatro transacciones revertidas. Comprobadas también edición/archivo, eliminación, aislamiento, texto idéntico intencionado y cliente anterior. Solo datos sintéticos, limpiados al terminar. Ninguna llamada de IA ni escritura en producción.
- La restricción única produjo mensajes Prisma P2002 esperados en el ensayo concurrente; la función los gestionó y las cinco peticiones terminaron correctamente.

Repetir el ensayo de integración desde la raíz, solo con la base QA: `node --env-file=apps/api/.env.local packages/db/node_modules/tsx/dist/cli.mjs apps/api/scripts/check-idea-saves.ts`. El script comprueba el host antes de consultar o escribir y elimina únicamente sus identificadores sintéticos.

## Archivos principales

- `apps/mobile/src/hooks/useOfflineQueue.ts` y `apps/mobile/app/(tabs)/inicio.tsx`.
- `apps/mobile/src/api/ideas.ts`, contrato compartido y errores traducidos ES/IT/EN.
- `apps/api/lib/create-idea.ts` y `apps/api/app/api/ideas/route.ts`.
- Modelo `IdeaCreateReceipt` y migración en `packages/db/prisma/`.

## Prueba física al publicar

1. Guardar una idea con conexión: aparece una vez; pulsar rápido dos veces también crea solo una.
2. Sin conexión, guardar otra idea, cerrar y abrir la app, recuperar la conexión y volver a Inicio/actualizar: aparece una vez.
3. Cortar la respuesta después de que el servidor confirme internamente el guardado, recuperar conexión y actualizar: la misma idea conserva su ID. Este punto se verifica de forma determinista con el ensayo; apagar Wi-Fi manualmente no garantiza reproducir ese instante.
4. Si se editó, archivó o eliminó la idea antes del reintento, comprobar que esa decisión se conserva.

Siguiente prioridad acordada: comprobar restauración de copias; después revisar presupuesto real de IA y actualizar la información de privacidad. Mantener el producto sencillo.
