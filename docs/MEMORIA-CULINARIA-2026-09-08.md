# Memoria culinaria — implementación

Actualización de calidad del 9 de septiembre: realizadas las pruebas reales con GLM y el recorrido hasta un chat Gemini. Se corrigieron generalizaciones sin respaldo y se redujo a cuatro tendencias automáticas por generación. Estado detallado y publicación en [Validación de memoria](VALIDACION-MEMORIA-2026-09-09.md). El texto inferior conserva el registro original de implementación.

Actualización del 9 de septiembre: la migración de memoria ya está aplicada a producción y el proveedor GLM está configurado con paquete activo. Véase [Activación de IA](ACTIVACION-IA-2026-09-09.md). Se conserva la preferencia de aprendizaje de cada restaurante. El texto siguiente registra el estado de la implementación antes de su publicación.

Implementado en el código y en la base de pruebas. Sin despliegue de producción, sin APK publicado y sin llamadas reales a GLM.

Decisión posterior del usuario, ya implementada: Gemini 3.8 Flash para el chat Diario, Claude Opus 5 para el chat Creativo y GLM 5.3 Flash para memoria, extracción y estilos de menú. La memoria guardada pertenece a Atelier y se entrega a ambos modelos de chat. La comparación de recetas orientó esta elección; las pruebas reales dentro de la app quedan para más adelante. Véase [configuración de proveedores](PROVEEDORES-IA-2026-09-08.md).

## Experiencia

«Nuestra cocina» está en el perfil, sin pestaña adicional. Administrador y chef ejecutivo pueden describir la cocina, activar/desactivar el aprendizaje, corregir tendencias, excluir categorías y borrar lo aprendido. El sous-chef consulta; los espectadores no acceden. Hay protección de cambios sin guardar, errores de red y edición concurrente. Textos en español, italiano e inglés.

La descripción reutiliza `Restaurant.identityLine`, ampliada a 1.000 caracteres. Orienta el chat inmediatamente aunque el aprendizaje esté desactivado. La memoria es del restaurante y se conserva separada de las preferencias de otros equipos. Borrar tendencias elimina también correcciones/exclusiones y desactiva el aprendizaje, conservando la descripción y el registro de consumo.

Se muestran siete categorías posibles, como máximo una tendencia por categoría: orientación culinaria, ingredientes, técnicas, sabores, texturas, presentación y complejidad. Corregir fija el criterio del chef en esa categoría. «No representa nuestra cocina» excluye la categoría para impedir que una paráfrasis reaparezca; la pantalla explica esta exclusión y permite recuperar las categorías. No hay que aprobar cada actualización.

## Aprendizaje y consumo

- Solo recetas en prueba y aprobadas. Hasta diez de cada grupo, completando huecos con el otro. Se consultan las 100 más recientes de cada estado para disponer de margen al deduplicar y se seleccionan hasta 20.
- Las copias con los mismos ingredientes y método normalizados cuentan una vez; se da prioridad a la aprobada. La detección de variantes es heurística: no es una comparación semántica de cualquier receta posible.
- Cada tendencia requiere tres elaboraciones distintas y guarda sus identificadores y huellas. El chat vuelve a comprobar que esas fuentes existen, mantienen contenido y siguen en prueba/aprobadas. Si pierde respaldo, la omite.
- Ingredientes y método, sin precios, banco, notas libres ni conversaciones. Extractos acotados por receta; máximo 20.000 caracteres de entrada de datos y 4.096 tokens de salida, incluido el razonamiento de GLM. Es un techo por llamada, no una cantidad que se consuma necesariamente. Se solicita razonamiento bajo y se registra el consumo comunicado por el proveedor.
- Como máximo un intento cada siete días, incluido un intento fallido. Sin reintentos automáticos inmediatos. La primera generación puede realizarse en la siguiente ejecución con al menos tres elaboraciones válidas; las posteriores respetan siete días desde el último intento.
- Triggers de PostgreSQL registran novedades en cualquier vía de escritura de recetas e ingredientes. Precios, prioridad y notas no activan aprendizaje. Una huella adicional evita llamar por datos culinarios que no cambiaron.
- Cron diario a las 05:00 UTC; esto no implica llamadas diarias. Procesa hasta 20 restaurantes pendientes y deja de iniciar trabajo después de 200 segundos. Los restantes conservan su turno pendiente para el próximo día. Supervisar ese retraso si aumenta el uso.
- Reserva atómica, bloqueo con vencimiento y control de versión/revisión. Una desactivación, corrección o borrado invalida trabajos en curso. Los fallos conservan la última memoria válida.
- Registro `CulinaryMemoryRun`: modelo, proveedor, estado, tokens disponibles y error acotado, sin guardar prompts o claves. Si una instancia muere, la siguiente ejecución cierra el intento abandonado sin repetirlo esa semana.

La memoria reemplaza la lista de ocho títulos recientes cuando está activada; la idea anclada y el hilo actual siguen presentes. La petición actual prevalece sobre las tendencias. Sin memoria activada, se mantiene el contexto anterior. Un fallo al consultar memoria no bloquea el chat.

## Configuración y despliegue

1. Aplicar `20260908010000_culinary_memory` y regenerar Prisma antes de servir la API nueva. Aplicada solamente a la base de pruebas verificada.
2. Configurar `ZAI_API_KEY` y `CRON_SECRET` en el servidor. El modelo por defecto es `glm-5.3-flash`; `CULINARY_MEMORY_MODEL` permite cambiarlo para memoria y `AI_GLM_MODEL` para todas las tareas GLM sin una excepción específica. Las claves de chat se detallan en el documento de proveedores.
3. El adaptador usa [Chat Completions de Z.AI](https://docs.z.ai/api-reference/llm/chat-completion): JSON, límite de salida y sin reintentos. Para GLM 5.2/5.3 pide razonamiento bajo; en los otros modelos configurados solicita desactivarlo. Confirmar compatibilidad y calidad con el modelo elegido antes de habilitarlo para usuarios.
4. La configuración local revisada no tiene clave Z.AI. El cron devuelve `unconfigured`; la pantalla informa que el aprendizaje aún no está disponible y permite editar la descripción. La disponibilidad indica presencia de configuración, no certifica la validez de una clave.
5. Publicar cliente y servidor compatibles, activar en un restaurante piloto y hacer la evaluación culinaria con GLM y la prueba física Android. Esa evaluación y el APK siguen pendientes.

API: `GET/PATCH/DELETE /api/restaurant/culinary-memory`; las escrituras requieren `expectedVersion`, el restaurante procede de la sesión y los conflictos devuelven 409. Cron interno autenticado: `GET /api/cron/culinary-memory`.

## Verificación

- Baterías API, móvil, contratos e idiomas: 943 pruebas superadas después de integrar los proveedores, entre la ejecución general y la repetición aislada de ocho pruebas de salida de restaurante. Esa suite agotó el tiempo de arranque durante la ejecución general y pasó al repetir sola.
- Tipos de API y móvil verificados. Exportación Android/Hermes completada; no equivale a instalar un APK ni a verificar teclado y gestos en un móvil físico.
- Prueba real con dos restaurantes temporales en PostgreSQL: separación de memoria, una sola generación ante concurrencia, límite semanal, registro de uso, rechazo de edición desactualizada, cambios de precio ignorados, retirada de fuentes inválidas, desactivación durante generación y borrado conservando identidad. Se usa un proveedor simulado y se limpian los datos temporales.
- No se evalúa todavía la calidad semántica de GLM. La validación garantiza formato, fuentes y límites, pero no demuestra por sí sola que una tendencia inferida sea culinariamente correcta.

No se implementan en este bloque historial recuperable de recetas, perfiles individuales ni resúmenes automáticos de conversaciones.
