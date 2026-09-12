# Guardado y chat: segunda entrega

6 de septiembre de 2026. Continúa la [primera entrega de fiabilidad](./CORRECCIONES-FIABILIDAD-2026-09-06.md). Cambios locales y migración aplicada a la base de pruebas; producción no se ha desplegado.

## Cambios

- **Receta y productos automáticos en una transacción.** El móvil deja de crear los productos pendientes por separado. El servidor valida referencias, reutiliza coincidencias exactas y crea los borradores junto con la receta y sus ingredientes. Un fallo revierte todo ese guardado. El enlace y archivo de la idea de origen también quedan dentro de la transacción; se valida el restaurante de la conversación.
- **Reintentos de creación identificados.** Cada borrador conserva una clave y el contenido exacto de su último intento. Si se pierde la respuesta de red, reenviar ese intento devuelve la receta existente. Cambiar el contenido bajo una clave ya guardada produce un conflicto explícito, sin duplicar ni sobrescribir silenciosamente. La clave está separada por restaurante y autor.
- **Creación automática de productos serializada.** El guardado, la edición de ingredientes y `/products/from-raw` comparten un bloqueo breve por restaurante. Dos solicitudes no crean dos borradores iguales; se conserva la posibilidad de crear variantes manualmente desde el banco.
- **Respuesta de chat guardada antes del evento final.** La respuesta se vincula al mensaje que la originó, con el modelo utilizado y sus métricas. Si falla la escritura, se informa del error; no se anuncia éxito. Una respuesta cortada por límite de tokens tampoco se declara completa.
- **Reutilización de respuestas.** Repetir un mensaje identificado que ya tiene respuesta devuelve el texto guardado, sin reservar otra llamada ni invocar al modelo. Si la generación anterior falló y no se guardó respuesta, el reintento sí genera una nueva, conservando un solo mensaje del usuario.
- **Un turno activo por conversación.** El servidor rechaza envíos simultáneos antes de gastar tokens. El bloqueo tiene vencimiento para recuperarse de una caída; un proceso antiguo no puede guardar encima de uno nuevo. Un reintento antiguo sin respuesta se rechaza si la conversación avanzó, para evitar contestar una pregunta distinta.
- **Recuperación al abrir el chat.** Los mensajes devuelven su identificador de envío; si el último mensaje guardado del usuario está sin respuesta, el móvil ofrece reintentarlo al volver a abrir la conversación.
- **Extracción de recetas desarrolladas en varios mensajes.** Se envían la receta base más reciente y sus cambios posteriores, incluidas las peticiones del chef. Se mantiene una sola llamada de extracción y un límite de 30 000 caracteres. Si se supera, se pide consolidar la receta; no se corta el texto silenciosamente. No se envía el banco al modelo para calcular costes.
- **Permiso de chat de prueba.** Un espectador que ya pertenece a un restaurante no puede saltarse el permiso de chat usando la ruta de prueba.

## Verificación

**812 pruebas automatizadas pasan:** API 457, móvil 109, contratos/utilidades 241 e idiomas 5. Se ejecutaron las baterías completas y, tras añadir los últimos tres casos del chat, se volvió a ejecutar su archivo afectado. Los cinco paquetes pasan la comprobación de tipos.

La exportación de Android terminó correctamente con 2285 módulos. El paquete JavaScript/Hermes está en `.codex/android-guardado-chat-2026-09-06`; esta comprobación no equivale a instalar un APK ni a probar la interfaz en un teléfono físico.

Las pruebas reproducen fallos de escritura, límite de tokens, reenvíos, contenido cambiado, concurrencia, pérdida de propiedad del turno, referencias a otro restaurante, conservación de cantidades y recuperación del envío local.

La comprobación real en la base de pruebas verificó:

1. Dos guardados simultáneos con la misma clave: una receta y un producto, con las dos cantidades conservadas.
2. Reutilizar la clave con otro contenido: conflicto explícito.
3. Crear un producto automático y forzar un fallo en la transacción: no queda el producto.
4. Reenviar por HTTP un mensaje con respuesta previamente guardada: respuesta recuperada, dos mensajes totales y ningún incremento de cuota.
5. Una conversación con turno activo: HTTP 409 sin llamada de IA.

Los registros sintéticos de esa comprobación se eliminaron al finalizar. No se hicieron llamadas de pago a proveedores.

La migración aditiva es `20260906160000_reliable_saves_and_chat`. El despliegue requiere aplicarla antes de servir el nuevo backend y cliente.

## Límites y trabajo siguiente

- Las garantías de reintento se aplican a los envíos identificados del nuevo cliente. Las respuestas históricas anteriores no tenían vínculo al mensaje de origen y no se reconstruyen automáticamente.
- Si una instancia del servidor desaparece sin liberar su turno, el bloqueo expira a los diez minutos. Los fallos normales y las cancelaciones lo liberan al finalizar.
- La identificación de la receta base usa encabezados explícitos en español, italiano o inglés. Si no los encuentra conserva la conversación completa, sujeta al límite; la corrección culinaria de la extracción sigue necesitando revisión del chef.
- La creación manual de productos, la importación inicial del chat sin restaurante y la cola de ideas siguen siendo flujos independientes. No se declara que toda la app tenga garantía de exactamente una escritura ante cualquier corte de red.
- Sigue pendiente: historial recuperable de recetas, memoria culinaria breve y editable, revisión visual con menús reales y comparación de proveedores. No se cambiaron modelos ni presupuestos de generación.
