# Correcciones de memoria culinaria — 13 de septiembre de 2026

Estado: **publicado y verificado en producción el 14 de septiembre de 2026**, realizado por GPT-5.6 Sol con razonamiento ultra y revisión independiente. El código de memoria está en `6d22033`; Vercel lo sirve bajo `https://atelier-2-0-mu.vercel.app` (el despliegue documental posterior es `dpl_ADb18gvje4CdBCbFbzqByHainDJ8`).

## Alcance autorizado

El usuario pidió verificar una auditoría externa, revisar primero el plan y después implementar sus seis pasos con GPT-5.6 Sol en ultra. Se conserva una memoria pequeña por restaurante, opcional y editable, sin nuevas pantallas. Las reglas de conservación, invalidación e historial no necesitan llamadas de IA.

1. Huellas de ingredientes y método, estables al aprobar o renombrar. Compatibilidad comprobable con huellas anteriores; no convertir fuentes antiguas a ciegas.
2. Contexto de recetas recientes como respaldo cuando la memoria esté vacía o falle, evitando duplicar siempre ambos bloques.
3. Contexto preparado persistido con invalidación por revisión. Una lectura ligera cuando sigue vigente; reconstrucción determinista cuando cambian fuentes o preferencias.
4. Un reintento adicional a partir de 24 horas para fallos temporales elegibles, con límite semanal normal y presupuesto común respetado. Mantener propiedad del trabajo y controles de concurrencia.
5. Pruebas del programador, plazo de ejecución, recuperación de trabajos interrumpidos y carreras sobre PostgreSQL aislado.
6. Historial técnico mínimo de tendencias publicadas, conservación de 30 días y eliminación de ese contenido al borrar memoria; optimización acotada de caché, sin prometer ahorro no medido.

## Matices de la auditoría

- El defecto de la huella oculta una tendencia si quedan menos de tres fuentes distintas válidas; no borra la fila de tendencias.
- El generador actual utiliza un lote de hasta veinte recetas y hasta cuatro tendencias. Las 160 fuentes son el techo teórico del formato almacenado, no la lectura habitual de cada mensaje.
- Las revisiones, huella, límite temporal y token de trabajo tienen finalidades diferentes. No retirar todas estas defensas para simplificar el código.
- El chat comprobaba `version` pero no `dirtyRevision` después de leer fuentes: existe también una carrera con cambios de recetas.
- La evaluación real de GLM del 9 de septiembre se conserva en [su registro](VALIDACION-MEMORIA-2026-09-09.md). El resultado satisfactorio de esos ejemplos no garantiza precisión semántica universal.
- Anthropic reutiliza prefijos idénticos: una corrección cambia la siguiente petición inmediatamente, sin esperar el TTL. Medir reutilización con los contadores del proveedor ya existentes.
- Vercel documenta 300 segundos para Hobby con Fluid Compute. El panel del proyecto requiere iniciar sesión; su configuración efectiva continúa sin verificar. Una consulta a producción con transacción de **sólo lectura** encontró un aprendizaje completado el 10 de septiembre: inicio `05:47:57.896Z`, fin `05:48:01.951Z`, sin error. Coincide con la franja del cron diario, pero identificar el origen de la invocación requiere sus logs. Al consultar había una memoria activada y ninguna vencida para procesar.

## Validación preparada

- Árbol de trabajo limpio al comenzar, rama `main`, base consolidada `466a1de`.
- Esquema exclusivo de pruebas creado en el endpoint de Neon de pruebas, distinto de producción. Credenciales cargadas en memoria; nunca copiadas al informe.
- Se cargó el esquema anterior y se sembraron cuatro restaurantes ficticios con memoria anterior: intacta, aprobación de una fuente, cambio de título y cambio de método. Así se probará la transición desde datos existentes, no sólo filas nuevas.
- La comprobación anterior a la corrección reprodujo en PostgreSQL el defecto: memoria intacta disponible, pero la aprobación de una fuente dejó la tendencia inutilizable. Los cambios de título y método también la invalidaron.
- Una migración histórica de BYOK usaba `"public"."User"` explícito. Durante la preparación añadió tres columnas vacías en el esquema principal de **pruebas**. Se retiraron sólo esas columnas recién creadas, verificando bajo bloqueo que no contenían valores; se comprobó después su ausencia. Se completó el esquema aislado. Producción no se tocó.
- Los arneses y fixtures de esta revisión están en `tmp/`, excluido de Git. Las regresiones permanentes se incluyen junto al código en el repositorio de trabajo.
- La migración aditiva `20260913010000_culinary_memory_reliability` se aplicó correctamente al esquema aislado. La comprobación posterior conservó la memoria intacta y la de aprobación; rechazó fuentes legacy con título desconocido o método cambiado. Sin llamadas de IA.
- La revisión detectó una regresión adicional: guardar sólo los hechos actualmente válidos impedía recuperar una tendencia al restaurar una receta de la papelera. Se reprodujo en PostgreSQL y se corrigió separando fuentes conservadas y contexto visible. La misma prueba pasó después: ocultar al borrar, recuperar al restaurar, sin IA.
- La revisión independiente de código cerró sin hallazgos concretos pendientes tras comprobar bloqueos, versiones, traslado entre equipos y reintentos después de una respuesta registrada.
- Se detectó que el parámetro `schema` del cliente no bastaba para asegurar la resolución de SQL sin calificar y triggers en el entorno aislado. El arnés final usa conexión directa al mismo endpoint de pruebas y `options=-c search_path=<esquema>`; se verificó `current_schema()` antes de repetir las comprobaciones. Las funciones del esquema principal de pruebas conservaron su definición anterior.
- Integración PostgreSQL: **11 grupos aprobados**, con proveedor simulado y cero llamadas pagadas: reserva concurrente única, separación de restaurantes, conservación ante aprobación/título/precio, traslado entre equipos, actualización del servidor anterior, corrección del chef, un reintento a 24 horas, recuperación con/sin respuesta registrada, retención de 30 días, borrado durante generación y borrado del historial conservando consumo.
- Compatibilidad legacy y papelera/restauración se repitieron correctamente con la conexión aislada explícita. El esquema temporal se eliminó al finalizar; no se aplicaron cambios a producción.
- Suite API: **704/704 pruebas únicas en 77 archivos**. El run conjunto pasó 688 y omitió 16 por dos timeouts de inicialización; los dos archivos pendientes pasaron aislados, 8/8 cada uno. No se suman como pruebas adicionales.
- Prisma validate/generate, TypeScript API, build Next, `git diff --check` y actualización de graphify correctos. El build aceptó la ruta del cron y generó las ocho páginas estáticas.
- El postbuild emitió un aviso anterior que sólo busca el motor Prisma físicamente bajo `.next`. Se revisaron los manifests NFT del cron y del chat: ambos incluyen referencias a binarios RHEL existentes de 17.547.808 bytes y cabecera ELF válida. El empaquetado final de Vercel se verificará al publicar; no se modificó el verificador en esta entrega.

## Comportamiento implementado

- Fuentes nuevas con huella v2 de ingredientes y método. Una fuente legacy se convierte sólo si coincide con el título/contenido actuales y uno de los dos estados elegibles; se conservan las fuentes temporalmente inválidas para poder recuperar una receta restaurada.
- `preparedContext`, `preparedRevision` y `preparedVersion` permiten reutilizar una memoria vigente sin releer recetas. Reconstrucción con escritura condicional: si cambia la revisión o versión durante la lectura, no se publica ese contexto. El guardado anterior del servidor, que aumenta versión sin revisión, también invalida el contexto.
- Cambios de contenido, elegibilidad, borrado o pertenencia del restaurante invalidan mediante triggers; aprobación y renombrado mantienen la huella. La descripción y las correcciones siguen aplicándose desde las pantallas existentes.
- La ruta de mensajes recupera hasta ocho títulos recientes sólo cuando falta memoria útil o falla su lectura. Evita esa consulta cuando ya dispone de memoria útil.
- La ventana normal se cuenta desde el último intento. Un fallo transitorio elegible puede reservar un único reintento a partir de 24 horas; cada petición sigue pasando por el presupuesto común. Una respuesta ya registrada impide el reintento por fallos posteriores de guardado.
- Todas las transacciones que tocan memoria e intento siguen el orden memoria → intento. El token y las revisiones impiden que un trabajo antiguo publique, borre un bloqueo nuevo o reponga contenido borrado.
- El mantenimiento depura contenido histórico de más de 30 días y recupera intentos interrumpidos de forma acotada. Conserva consumo y códigos de error, sin recetas ni prompts. El borrado de memoria elimina también `publishedTrends` en la misma transacción; las copias cifradas mantienen su política separada.
- El cron usa un plazo de 270 segundos dentro del máximo declarado de 300, reserva margen para iniciar restaurantes y limita el mantenimiento. La señal llega hasta GLM; no equivale a poder cancelar instantáneamente una consulta ya iniciada en la base de datos.
- La memoria útil tiene un marcador propio de caché después de identidad y antes de la idea anclada. Son como máximo cuatro marcadores contando el hilo. Una corrección cambia la petición inmediatamente; no se ha medido ahorro con llamadas pagadas durante esta tarea.

## Publicación

Publicación completada. El build de Vercel ejecutó `prisma migrate deploy`; la migración `20260913010000_culinary_memory_reliability` quedó aplicada en producción sin rollback. El despliegue está `Ready`, usa Node 24, Fluid Compute y el cron de memoria `0 5 * * *`; la función publicada tiene timeout de 300 s en `fra1`. La comprobación pública del 14 de septiembre devolvió `/api/health` HTTP 200 con base de datos y los tres proveedores configurados, privacidad HTTP 200, rutas de memoria y cron sin credenciales HTTP 401. La validación automática de compilación, tipos, migraciones y 704 pruebas sigue verde. El escáner de dependencias queda rojo por siete avisos transitorios sin parche compatible o que requieren actualizar herramientas mayores (`deepmerge-ts`, `extract-zip`, `image-size`, Vite y Vitest); se conserva visible y documentado, sin falsear un estado verde.

No hacen falta cambios de proveedores, claves, nuevas pantallas ni reconstruir APK/TestFlight para estas correcciones. La documentación y la privacidad se actualizaron junto con la implementación.
