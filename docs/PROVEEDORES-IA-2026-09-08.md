# Proveedores de IA — implementación del 8 de septiembre de 2026

Actualización del 9 de septiembre: los proveedores ya están configurados en producción, GLM tiene un paquete activo, el servidor se publicó y el APK está disponible. El estado vigente y las comprobaciones están en [Activación de IA](ACTIVACION-IA-2026-09-09.md). El texto siguiente documenta la implementación y su estado previo al despliegue.

Implementado y verificado localmente. El usuario aplaza la prueba con los proveedores reales y la actualización del APK. No se ha publicado este cambio ni se han realizado llamadas de pago para validarlo.

## Distribución acordada

| Función | Proveedor | Modelo por defecto | Configuración opcional |
| --- | --- | --- | --- |
| Chat Diario | Google | `gemini-3.8-flash` | `AI_CHAT_DAILY_MODEL` |
| Chat Creativo | Anthropic | `claude-opus-5` | `AI_CHAT_CREATIVE_MODEL` |
| Extracción de recetas: texto, archivos, fotos | Z.AI | `glm-5.3-flash` | `AI_EXTRACTION_MODEL` |
| Lectura visual del estilo de menú | Z.AI | `glm-5.3-flash` | `AI_MENU_STYLE_MODEL` |
| Generación y ajuste de su diseño | Z.AI | `glm-5.3-flash` | `AI_MENU_THEME_MODEL` |
| Memoria culinaria | Z.AI | `glm-5.3-flash` | `CULINARY_MEMORY_MODEL` |

El chef ve solo dos opciones de chat: Diario y Creativo. Ambas reciben la misma identidad, memoria culinaria, idea anclada y conversación. El banco de productos sigue sirviendo para costes mediante reglas de la app; no restringe los ingredientes que puede proponer el chat. Los cálculos, permisos, guardados e historial no requieren IA.

Las preferencias antiguas siguen siendo compatibles: `haiku` y `sonnet` se interpretan como Diario, `opus` como Creativo. Cada respuesta guardada registra el identificador real del modelo en `Message.modelId`.

## Configuración y futuras versiones

Las claves `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` y `ZAI_API_KEY` viven solo en el servidor. Nunca se incorporan al APK ni se usan variables `EXPO_PUBLIC_` para ellas. La configuración está centralizada en `apps/api/lib/ai/config.ts`; `.env.example` contiene los nombres sin secretos reales.

`AI_GLM_MODEL` cambia el modelo común de las tareas Z.AI. Una variable específica de la tabla tiene prioridad sobre ese valor. Sin variables se usan las versiones fijadas en el código. El cliente envía el modo de chat, no un modelo arbitrario.

Una actualización de modelo que conserve el protocolo puede hacerse en el entorno del servidor, reiniciando o desplegando la API, sin recompilar el APK. Cambiar de protocolo o proveedor exige adaptar la integración y volver a verificarla. Las versiones no se actualizan automáticamente: se eligen después de comprobar disponibilidad, calidad, latencia y consumo.

La configuración local revisada tiene clave de Anthropic, pero faltan las de Gemini y Z.AI. Tener una clave configurada no demuestra que sea válida ni que la cuenta tenga acceso al modelo. El diagnóstico de salud comprueba presencia de configuración; su comprobación profunda de autenticación existente solo alcanza Anthropic.

## Control del consumo y errores

- Una petición por turno de chat; sin reintentos del SDK ni cambio automático a otro proveedor cuando falla.
- Historial limitado a 20 mensajes recientes y 40.000 caracteres, conservando mensajes completos. La memoria del restaurante es pequeña y se reutiliza en los dos chats.
- Techos de salida por petición: Diario 8.192, Creativo 16.384, extracción 8.192, lectura de estilo 4.096, diseño 16.384 y memoria 4.096 tokens. Son máximos, no objetivos de longitud. El presupuesto incluye razonamiento cuando el proveedor lo contabiliza así; se registra también el desglose disponible.
- Opus usa razonamiento adaptativo con esfuerzo alto. Gemini y GLM 5.3 usan esfuerzo bajo. No se muestra el razonamiento interno al chef.
- Tiempo máximo: chat 240 segundos; extracción y memoria 45; lectura de estilo 60; generación de diseño 80 por petición. La desconexión del chat cancela su petición al proveedor.
- Un escaneo nuevo conserva el máximo anterior de tres llamadas: lectura de estilo y hasta dos para diseño (generación más reparación o refinamiento). No hay una llamada adicional para elegir un modelo. Las referencias ya guardadas se reutilizan; cambiar de versión no fuerza una regeneración de pago.
- La memoria mantiene como máximo un intento cada siete días por restaurante, incluso cuando falla. Precios y notas no disparan el aprendizaje. Véase [memoria culinaria](MEMORIA-CULINARIA-2026-09-08.md).
- Se conservan las cuotas de peticiones y el registro de tokens disponibles, incluidos los comunicados antes de detectar una respuesta incompleta. Los registros incluyen tarea, modelo, proveedor y latencia, sin prompts ni claves. La contabilidad depende de los datos que alcance a devolver cada proveedor.

El chat conserva idempotencia, control de concurrencia y guardado antes de confirmar el final al móvil. Una respuesta truncada no se guarda como respuesta completa. Las salidas estructuradas de GLM se validan con los esquemas de la app; no se asume que el modo JSON garantice su contenido.

## PDF e imágenes

Los PDF visuales se convierten localmente en imágenes de todas sus páginas, en orden, usando `unpdf` y `@napi-rs/canvas`. GLM recibe el formato documentado de imágenes; no se depende de un formato de adjunto PDF sin verificar. Los PDF de recetas sin texto extraíble tienen esta vía visual.

Se aceptan hasta diez páginas y 10 MB de archivo; las imágenes individuales admitidas son JPEG, PNG y WebP, con límite de 6 MB. La conversión limita la dimensión mayor a 2.200 píxeles, cada página a 6 MB y el conjunto de imágenes a 20 MB. Los documentos que exceden los límites se rechazan, sin omitir páginas silenciosamente. El archivo original se conserva intacto para poder guardarlo y reutilizarlo.

El escaneo sigue siendo para cualquier restaurante. Las validaciones de dimensiones, fuentes, estructura, contenido, impresión y versiones de borrador se mantienen. El PDF Koko se utilizó como comprobación local de conversión; no sustituye la futura evaluación de fidelidad con GLM y otras cartas.

## Verificación realizada

- 943 pruebas locales superadas: API 565, contratos compartidos 253, móvil 120 e idiomas 5. Ocho pruebas de salida del restaurante agotaron el tiempo del arranque en la ejecución general y pasaron en una ejecución aislada.
- TypeScript de API y móvil correcto.
- Compilación de producción de Next.js completada; conserva una advertencia de dependencias dinámicas de la instrumentación Sentry/OpenTelemetry.
- El comprobador antiguo de Prisma avisa al buscar el motor físicamente dentro de `.next`. Se revisaron los manifiestos del empaquetado: las 67 rutas de API referencian un motor Linux RHEL que existe. El aviso de ese script no refleja un archivo ausente en los manifiestos; la ejecución del paquete final en Linux queda para el despliegue.
- Exportación Android/Hermes completada en `tmp/android-ai-providers-2026-09-08`. Es una comprobación del paquete JavaScript, no un APK instalado. Expo advierte que la organización/proyecto de Sentry requieren configuración en el entorno de compilación.
- Conversión real del PDF Koko: dos páginas completas y legibles, inspeccionadas visualmente; el archivo original conserva su huella. Cero peticiones a proveedores.
- Las pruebas de adaptadores simulan respuestas HTTP y comprueban selección de modelos, formatos, uso de tokens, streaming fragmentado, errores y límites. No acreditan todavía calidad culinaria, latencia real ni acceso de las cuentas a esos modelos.

Antes de publicar se configurarán las claves pendientes, se comprobará el empaquetado en Linux y se aplicarán las migraciones previas requeridas por memoria y guardados. Después se hará la prueba integrada con los tres proveedores y el APK en Android, tal como decidió el usuario.

## Referencias técnicas consultadas

- [Claude Opus 5](https://platform.claude.com/docs/en/models/opus-5/whats-new-opus-5).
- [Gemini: generación y streaming](https://ai.google.dev/api/generate-content) y [modelo actualizado](https://ai.google.dev/gemini-api/docs/latest-model?hl=en).
- [GLM 5.3 Flash: visión y razonamiento](https://docs.z.ai/guides/vlm/glm-5.3-flash) y [Chat Completions de Z.AI](https://docs.z.ai/api-reference/llm/chat-completion).
