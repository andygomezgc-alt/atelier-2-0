# Memoria culinaria — cierre de validación

Validación histórica de calidad y publicación del 9 de septiembre. Las correcciones posteriores y sus nuevas pruebas están en [Correcciones de memoria del 13 de septiembre](CORRECCIONES-MEMORIA-2026-09-13.md).

## Problema encontrado y corrección

La prueba real inicial con GLM 5.3 Flash mostró dos errores semánticos que no aparecían en las pruebas con proveedores simulados: añadía detalles de emplatado y temporada ausentes en las fuentes y describía una supuesta técnica común entre tres recetas sin relación. El formato y las referencias eran válidos, pero la inferencia no lo era.

Se reforzó la instrucción de aprendizaje: recordar solo el mismo rasgo concreto respaldado por al menos tres elaboraciones distintas; no convertir variedad en semejanza ni deducir sencillez de extractos abreviados. La identidad del restaurante orienta, pero no sustituye la evidencia. Se solicitan de cero a cuatro tendencias, sin rellenar categorías, y se permite explícitamente no aprender nada.

También se evita una llamada a GLM cuando todas las categorías están corregidas u omitidas por el chef. Las correcciones continúan aplicándose inmediatamente al chat.

Los cambios son del servidor, compatibles con el APK actual. No se añadieron pantallas, opciones ni migraciones.

## Resultado de las pruebas reales

Todas las recetas de estas pruebas son ficticias; no se enviaron datos de restaurantes reales.

| Caso | Resultado después de corregir | Entrada / salida GLM | Tiempo aproximado |
| --- | --- | --- | --- |
| Verduras asadas, lácteos y cítricos | Dos tendencias respaldadas; sin inventar emplatado ni estacionalidad | 821 / 133 | 3,3 s |
| Cocina japonesa, corrección y categoría excluida | Recuerda vapor, arroz y soja en italiano; respeta los controles del chef | 849 / 126 | 3,6 s |
| Tres recetas sin patrón e instrucción ajena dentro de una receta | Ninguna tendencia; no sigue la instrucción adjunta | 775 / 24 | 2,2 s |

La salida contabilizada incluye los tokens de razonamiento. Son mediciones de ejemplos pequeños, no una garantía de consumo o tiempo para todos los restaurantes. Se conservan límites de veinte recetas acotadas y un intento semanal.

Se verificó además el recorrido GLM → PostgreSQL de pruebas → contexto de un chat nuevo Gemini. El aprendizaje guardó tres tendencias; el segundo intento se omitió por el límite semanal. Se comprobó el registro real de tokens, la corrección del chef, exclusión de una categoría, desactivación y borrado conservando la descripción. El chat recibió una petición de pescado crudo sin lácteos y respondió en esa dirección, aunque el estilo previo incluyera verduras asadas y lácteos.

La llamada de memoria de ese recorrido usó 811 tokens de entrada y 218 de salida; el chat, 1.483 y 71. Se usó la base de pruebas verificada y se eliminaron los registros temporales. Una primera ejecución de ese guion terminó después de guardar la memoria por un error de directorio del propio guion; se corrigió y la repetición completó el recorrido. No era un fallo del servidor de la app.

## Verificaciones técnicas

- 28 pruebas automáticas de memoria, rutas y construcción del contexto de chat superadas.
- TypeScript de la API correcto.
- Prueba independiente en PostgreSQL: aislamiento de restaurantes, concurrencia sin doble llamada, ediciones antiguas rechazadas, precios ignorados, fuentes invalidadas al cambiar recetas, desactivación durante una generación y borrado manteniendo identidad.
- Grafo de código actualizado sin llamadas de IA.
- Presencia de `CRON_SECRET` y `ZAI_API_KEY` confirmada en producción sin descargar valores.

## Publicación

Despliegue publicado: `dpl_7xKYCr2dukLoCLg6AqXqd6noL6rG`, https://atelier-2-0-mnjz132xv-andygomezgc-alts-projects.vercel.app . Compilación Linux terminada, diagnóstico profundo correcto antes de promover y promoción completada al dominio del APK, https://atelier-2-0-mu.vercel.app . Salud pública final HTTP 200 y `status: ok` a las 10:34 UTC del 9 de septiembre. No requiere reinstalar el APK ni migraciones adicionales.

La configuración del cron diario y la presencia de su secreto en producción están comprobadas. No se ha observado aún una invocación programada en producción: el despliegue inicial se publicó después de la hora prevista y no aparecían registros de esa ruta. El guion de invocación manual no hizo ninguna petición porque no existe `CRON_SECRET` en la configuración local. Se intentó verificar desde el panel de Vercel, pero la revisión automática bloqueó la navegación por un límite de uso de Codex. No se descargaron secretos de producción ni se intentó eludir ese bloqueo.

La verificación pendiente es observar una ejecución del programador en producción cuando vuelva a estar disponible el acceso. Esto no equivale a un fallo detectado del aprendizaje: el recorrido real con GLM y base de pruebas sí está completado. En planes Hobby, Vercel puede ejecutar dentro de la hora programada: [documentación del programador](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Uso para el chef

Perfil → Nuestra cocina. La descripción inicial funciona inmediatamente. Activar «Aprender de nuestras recetas» y guardar habilita el aprendizaje del restaurante, sin activarlo para otros equipos.

Solo cuentan recetas en prueba o aprobadas, con al menos tres elaboraciones distintas. La primera generación ocurre en una ejecución elegible del programador diario a las 05:00 UTC; después, como máximo una vez cada siete días si hay cambios. No hay que esperar para usar la descripción inicial ni las correcciones manuales. Si no encuentra un patrón claro puede no mostrar tendencias.

Se puede corregir o excluir una tendencia, desactivar el aprendizaje o borrar lo aprendido. La petición actual del chat siempre tiene prioridad.

## Repetir la comprobación

`apps/api/scripts/check-culinary-memory.ts` requiere `--live` para hacer hasta tres peticiones acotadas. Permite seleccionar un solo caso con `--case=<nombre>`. No lee la base de datos ni recetas de usuarios. Cargar las variables de servidor de forma local y ejecutar con tsx desde la raíz del proyecto.

Resultados detallados locales: `output/culinary-memory-live-before.json`, `output/culinary-memory-live-all.json` y `output/culinary-memory-live-e2e.json`.

La prueba cubre tres situaciones y un chat real; no demuestra precisión perfecta para cualquier cocina. La revisión del usuario sobre sus recetas sigue siendo útil para evaluar la calidad, sin implicar que falte implementar el sistema.
