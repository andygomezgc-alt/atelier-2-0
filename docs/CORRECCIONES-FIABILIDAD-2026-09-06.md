# Primera entrega de correcciones de fiabilidad

6 de septiembre de 2026. Cambios locales sobre el estado revisado en la [auditoría funcional](./AUDITORIA-FUNCIONAL-2026-09-06.md). No es un despliegue de producción ni el cierre de todos los hallazgos de la auditoría.

Actualización: la [segunda entrega, guardado y chat](./CORRECCIONES-GUARDADO-CHAT-2026-09-06.md), aborda el primer bloque de pendientes enumerado aquí.

## Cambios terminados

| Área | Comportamiento corregido |
| --- | --- |
| Menús y PDF | Lista, detalle y PDF usan el mismo filtro de recetas activas. Se rechaza exportar o modificar los platos de un menú en papelera. |
| Secciones | Al añadir o mover un plato, el servidor comprueba que la sección pertenece al menú. Se permite dejarlo sin sección. |
| Costes | Se distingue entre completo, parcial y no calculable. Sin porciones se muestra el total de la elaboración; no se inventa un coste por porción. Un cálculo parcial no genera porcentaje de food cost. |
| Merma | Se rechaza introducir 100 % de merma. Los datos antiguos con rendimiento útil cero se muestran como no calculables. Se mantienen las conversiones kg/g y l/ml. |
| Permisos | El código de invitación se devuelve solo al administrador. El servidor exige permiso de fichas de cocina para listar, leer y exportar recetas; la pestaña se oculta a los espectadores de una casa. |
| Borradores de receta | El formulario conserva texto sin terminar, porciones, pasos, notas, productos enlazados y ajustes de cantidades en el móvil. La recuperación distingue usuario, restaurante y receta editada. Se ofrece recuperar o descartar. Se elimina tras guardar correctamente en el servidor. |
| Ideas sin conexión | Se conservan errores temporales de servidor, límite de solicitudes y autenticación. Las operaciones concurrentes se ordenan para no sobrescribir ideas ni vaciar dos veces la misma cola. Un fallo de lectura no se interpreta como cola vacía. |
| Alérgenos | Los productos permiten varios alérgenos y una revisión explícita, incluida la declaración vacía. Las sugerencias antiguas permanecen pendientes de revisión. Cambiar el nombre o proveedor obliga a revisar de nuevo. Una copia conserva las sugerencias y requiere revisión. |
| Alérgenos en recetas y PDF | La unión de productos y añadidos manuales conserva todos los alérgenos. Se cuentan ingredientes sin enlazar y productos pendientes de revisión, también en recetas antiguas. El menú muestra los platos pendientes; el servidor rechaza un PDF con alérgenos si faltan revisiones. El PDF sin información de alérgenos sigue disponible. |

La revisión confirma la información declarada del producto; no añade evaluación automática de contaminación cruzada ni sustituye los procedimientos de cocina. El banco sigue siendo una referencia de costes, sin imponer existencias a las recetas creativas.

## Verificación

- **791 pruebas automatizadas**: API 441, móvil 104, contratos y utilidades compartidas 241, traducciones 5. La batería completa pasó; los últimos casos añadidos se verificaron después en sus archivos afectados.
- Comprobación de tipos en los cinco paquetes sin errores; repetida para la API tras los últimos cambios de pruebas.
- Exportación Android completada: 2284 módulos; bundle Hermes generado en `.codex/android-correcciones-2026-09-06/`. Es una comprobación de compilación, no un APK instalado ni una prueba en un teléfono físico.
- Migración aditiva `20260906070000_product_allergens_review` aplicada únicamente a la base de pruebas ya configurada. Conserva el campo antiguo y sus sugerencias, sin marcar revisiones de forma automática.
- Comprobación real de escritura y lectura de varios alérgenos y declaración vacía dentro de una transacción revertida. Se comprobó que no quedó el producto temporal.
- Comprobaciones HTTP autenticadas del servidor local con la cuenta sintética de pruebas, sin llamadas a modelos.
- Las reproducciones de `.codex/audit-functional-2026-09-05/probes.test.ts` describen el estado anterior; sus expectativas originales ya no representan el comportamiento deseado. Las pruebas vigentes están en las baterías API/móvil/shared.

## Qué sigue

1. **Guardado y conversación:** crear productos y receta de forma atómica; identificar reintentos para evitar duplicados; persistir respuestas antes de anunciar el fin del chat; recuperar correctamente interrupciones y recetas desarrolladas en varios mensajes.
2. **Historial y memoria:** revisiones recuperables de recetas y un perfil culinario breve, editable y limitado, sin enviar el banco completo en cada pregunta.
3. **Estilo del menú:** comparación de PDF completo con referencias reales, tratamiento de varias páginas y trabajos de generación recuperables.
4. **Proveedor de IA:** prueba comparativa con casos culinarios antes de modificar modelos; registrar calidad, coste total de razonamiento y respuesta, y latencia.
5. **Resto de auditoría:** paginación, límites del chat de prueba para espectadores, validación del origen de conversaciones, suscripciones y verificación de restauración de copias.

La cola local aún no garantiza exactamente una creación si el servidor guarda una idea y se pierde la respuesta de red: falta la idempotencia del servidor. El borrador de receta protege el texto local, pero todavía no convierte el guardado de productos y receta en una única transacción.

Antes del despliegue deben aplicarse la migración y el servidor compatibles con el nuevo cliente. Queda por probar la recuperación y la selección múltiple directamente en Android. Los proveedores de IA no se han cambiado en esta entrega.
