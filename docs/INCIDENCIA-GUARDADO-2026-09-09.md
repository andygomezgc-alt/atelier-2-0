# Error al guardar desde el chat — 9 de septiembre de 2026

## Evidencia

Dos peticiones `POST /api/recipes/extract` a las 13:32 UTC terminaron en HTTP 422 con `ai_response_invalid`. GLM 5.3 Flash respondió a ambas y se registraron sus tokens. El fallo ocurrió al interpretar su respuesta, antes de crear la ficha y antes de la escritura de una receta. No se detectaron errores HTTP 5xx en esa consulta.

Se recuperó la conversación del usuario mediante una transacción de solo lectura. El texto reconstruido tenía exactamente los 4.622 caracteres de ambos errores y coincidía con los 1.947 tokens de entrada al repetir la extracción. Para ello se leyó exclusivamente la variable de conexión de producción necesaria; no se descargaron todas las variables ni se guardó o imprimió la conexión.

La receta se convirtió correctamente en tres pruebas reales posteriores: cuatro raciones, diecisiete líneas de ingredientes y once pasos. También pasó una receta de control del repositorio. El error es intermitente; las respuestas originales inválidas no estaban registradas y no se pudo identificar qué carácter o envoltorio concreto contenían. No atribuir los dos fallos históricos específicamente a comas, markdown o saltos de línea sin nueva evidencia.

## Corrección aplicada

Se reforzó el lector de respuestas GLM para normalizar únicamente errores de formato recuperables cuando falla el parseo estricto:

- Un objeto JSON dentro de un único bloque markdown `json` completo.
- Comas finales de objetos y listas, fuera del contenido de las cadenas.
- Saltos de línea y caracteres de control sin escapar dentro de cadenas, conservando esos caracteres al interpretar el resultado.

No se agregan campos, comillas o cierres ausentes, ni se descartan ingredientes para completar una respuesta truncada. No se aceptan explicaciones externas, documentos concatenados o valores ambiguos. Se mantiene la validación Zod de la receta y el rechazo de generaciones incompletas. La normalización se hace localmente, sin otra llamada a la IA.

Los eventos `ai_json_invalid` y `ai_json_normalized` permiten distinguir fallos de formato, respuesta vacía y normalización. Registran tarea, proveedor, modelo, longitud y posición del error cuando existe; nunca contenido de recetas, prompts ni claves. Este diagnóstico permitirá identificar una variante no cubierta si el error vuelve a aparecer.

Esta corrección aborda una clase comprobable de errores que antes provocaban el mismo código. La reproducción con la receta original fue exitosa antes del ajuste, por lo que no demuestra que una de esas variantes fuera necesariamente la causa de los dos incidentes históricos.

## Verificación

- Se escribieron primero tres casos de formato recuperable y fallaron con `ai_response_invalid`; pasan después del cambio.
- Casos ambiguos y truncados siguen rechazados sin reintentos de pago.
- Prueba integrada de extracción conserva título, cuatro raciones, ingredientes, cantidades, comas y texto del método; normalizar no permite saltarse campos requeridos.
- 71 pruebas de extracción, adaptador GLM, memoria y estilos de menú superadas.
- TypeScript API correcto.
- No se escribieron ni alteraron recetas del usuario. La conversación original se conserva.

## Publicación

Publicado `dpl_ChoCyN7j4mruneQ7pqvN6YijnVvi`, https://atelier-2-0-dz6c3im4b-andygomezgc-alts-projects.vercel.app . Compilación Linux correcta, salud verificada antes de promover y promoción completada al dominio https://atelier-2-0-mu.vercel.app . Salud pública final HTTP 200 y `status: ok` a las 13:51 UTC. El APK actual es compatible y no necesita reinstalación.

Los guiones temporales de lectura de producción y reproducción se eliminaron al terminar. Los datos de reproducción permanecen en `.codex/recipe-save-debug`, excluido de Git y del despliegue. El grafo se actualizó tras la limpieza.

El usuario confirmó después «solucionado el problema» y pasó a solicitar la opción de nuevo chat. Incidencia cerrada según esa prueba de uso. Si vuelve a fallar, leer los nuevos eventos de formato antes de ampliar la normalización o repetir llamadas a GLM.
