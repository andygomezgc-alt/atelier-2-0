# Auditoría funcional y técnica de Atelier

Revisión iniciada el 5 y cerrada el 6 de septiembre de 2026. Estado del código local, incluidos los cambios de costes y estilo de menú de las sesiones anteriores.

**Actualización posterior:** la [primera entrega de correcciones](./CORRECCIONES-FIABILIDAD-2026-09-06.md) resuelve parte de los hallazgos de costes, menús, permisos, borradores y alérgenos. Este documento conserva la fotografía original de la auditoría; consulta esa entrega para el estado actual y los pendientes.

## 1. Mi valoración

**Me gusta la base del producto.** El recorrido «idea → conversación → receta → coste → menú» responde a una necesidad concreta de cocina. Hay trabajo aprovechable: conversiones con reglas, costes compartidos entre pantallas, revisión de recetas importadas, permisos, papelera, traducciones y generación de PDF. Mantendría esa dirección.

**Todavía no lo daría por cerrado para depender de él sin reservas durante un servicio.** Hay diferencias entre lo que la interfaz comunica y lo que el servidor garantiza: información de alérgenos incompleta, un PDF que puede incluir platos retirados, borradores que no sobreviven al cierre y respuestas del chat que se anuncian terminadas antes de guardarse. Cambiar de proveedor de IA no corrige esas diferencias.

Mi orden propuesto: **fiabilidad de los datos → continuidad del trabajo → estilo de menú comprobable → IA con contexto útil y gasto medido**. El banco debe seguir siendo una referencia económica; no hace falta convertirlo en un sistema de existencias para que el asistente cree recetas.

## 2. Alcance y evidencia

Revisé navegación móvil, contratos de datos, esquema de base de datos, rutas del servidor, cálculos, importación, chat, PDF, equipo, autenticación, suscripciones y herramientas de mantenimiento. Usé el grafo del proyecto para orientarme y contrasté el comportamiento con las implementaciones. El [inventario de rutas](<C:/Users/Utente/Desktop/atelier-2-0/docs/AUDITORIA-RUTAS-2026-09-06.md>) recoge **63 archivos de ruta y 86 métodos HTTP**. Ese inventario no equivale a ejecutar manualmente cada ruta.

Validación realizada:

| Comprobación | Resultado |
|---|---|
| Comprobación de tipos de los cinco paquetes | Aprobada |
| Pruebas existentes del servidor | 417 casos aprobados, contando la repetición indicada abajo |
| Pruebas existentes del móvil | 92 aprobadas |
| Pruebas de contratos y utilidades compartidas | 238 aprobadas |
| Pruebas de traducciones | 5 aprobadas |
| Total de pruebas existentes | **752** |
| Pruebas adicionales de caracterización de esta auditoría | **8**, reproducen limitaciones actuales |

La suite de salida del restaurante agotó dos veces los 10 segundos de su inicialización, antes de ejecutar sus ocho casos. Al repetirla con un límite de inicialización de 60 segundos, los ocho pasaron; esa última ejecución tardó unos 2,7 segundos. No hubo fallos de aserción en esos casos. Conviene estabilizar la carga de dependencias de esa suite.

Las ocho pruebas adicionales usan funciones reales y, para el PDF, base de datos y proceso de render simulados. Que pasen **significa que reproducen el comportamiento cuestionado**, no que lo hayan corregido. Están en [probes.test.ts](<C:/Users/Utente/Desktop/atelier-2-0/.codex/audit-functional-2026-09-05/probes.test.ts>).

No modifiqué la lógica de la app ni cambié los proveedores durante esta auditoría. No hice escrituras en la base de datos ni un despliegue. No se repitió aquí una prueba completa en Android, una compra real, la entrega de correos, una restauración de copias ni llamadas de generación a los modelos. La comparación con una foto/PDF real del usuario sigue pendiente. Las conclusiones de seguridad son una revisión del código, no una prueba exhaustiva de penetración.

## 3. Cómo se organiza la app

El móvil usa Expo/React Native. Las cinco pestañas principales son Inicio, Asistente, Recetas, Menús y Casa; el banco de productos tiene sus propias pantallas. El servidor Next.js ejecuta autenticación, operaciones de datos, IA y exportaciones. PostgreSQL conserva los datos mediante Prisma. Los contratos compartidos validan los mensajes entre móvil y servidor; las traducciones están separadas en español, italiano e inglés.

La relación principal es:

```text
Restaurante → equipo, identidad, estilo de menú y plan
            → ideas → conversaciones → mensajes
            → recetas → ingredientes → productos y precios
            → menús → secciones → platos vinculados a recetas
```

Un usuario pertenece como máximo a un restaurante a la vez. Las conversaciones se consultan por restaurante, no solo por autor: el diseño actual es colaborativo. No conviene presentar ese chat como un espacio privado del chef si otros miembros pueden acceder a él.

Hay además una web pública con presentación, planes, agradecimiento, privacidad, términos e instrucciones de eliminación de cuenta. Es distinta de la experiencia principal del móvil.

## 4. Funcionamiento por área

### 4.1. Acceso, Casa y equipo

**Ahora:** acceso móvil mediante correo, Google o Apple; creación de restaurante o incorporación por código; edición de identidad y fotografías; perfil, idioma y modelo preferido; gestión de miembros según rol. Las credenciales móviles permiten recuperar el usuario y su rol vigente desde el servidor. Existen controles de revocación, validación de tokens de proveedores y protección del acceso de desarrollo en producción.

La salida del restaurante contempla casos distintos: salida normal, transferencia necesaria si queda un único administrador y eliminación del restaurante cuando sale su último miembro. La eliminación de cuenta trata las autorías y relaciones para no dejar referencias rotas. Son operaciones que deben seguir siendo explícitas y deterministas.

**Problema confirmado en código:** la matriz reserva `view_invite_code` al administrador, pero la respuesta general de restaurante incluye el código para cualquier miembro autenticado. La matriz también excluye al rol `viewer` de `view_staff_recipe`, mientras que las lecturas generales de recetas no exigen ese permiso. La pertenencia al restaurante sí se comprueba; lo inconsistente es el alcance del rol dentro de él.

**Mejora:** definir qué necesita ver sala, qué cocina y qué administración; aplicar esa política en las respuestas del servidor. Mostrar u ocultar un botón no sustituye ese control. La IA no aporta nada a esta decisión.

Fuentes: [matriz de permisos](<C:/Users/Utente/Desktop/atelier-2-0/packages/shared/src/permissions.ts:19>), [lectura de restaurante](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/restaurant/route.ts:33>), [proyección del código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/projections.ts:503>), [detalle de receta](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/[id]/route.ts:46>).

### 4.2. Inicio e ideas

**Ahora:** se capturan notas rápidas, se editan o eliminan y se llevan al asistente como idea anclada. Una idea puede tener una conversación asociada. Al guardar una receta procedente de esa conversación, el servidor intenta archivar la idea. Si ese archivo falla, conserva la receta y registra el fallo: priorizar la receta guardada es razonable.

Hay una cola local para ideas cuando falla la red, separada por usuario y restaurante. Se reintenta al volver a la pantalla o después de ciertas acciones; no es una sincronización completa en segundo plano.

**Riesgo concreto:** al vaciar la cola, cualquier `ApiError` elimina ese elemento pendiente, incluso un 429 o un 500 que podría ser temporal. El identificador local no viaja como clave única al servidor. Si se guarda una idea pero se pierde la respuesta, el reintento puede duplicarla. Las operaciones de lectura y escritura de la cola tampoco están serializadas.

**Mejora:** conservar fallos temporales, reintentos progresivos, una clave única por idea y un indicador visible de pendiente/guardada. Capturar ideas no necesita IA. Clasificarlas o agruparlas puede ser una función opcional posterior.

Fuente: [cola de ideas](<C:/Users/Utente/Desktop/atelier-2-0/apps/mobile/src/hooks/useOfflineQueue.ts:44>).

### 4.3. Asistente y conversación

**Ahora:** recibe unas instrucciones culinarias fijas, nombre e identidad del restaurante, títulos y estados de ocho recetas recientes, la idea anclada y los últimos veinte mensajes. Envía la respuesta por fragmentos para que aparezca progresivamente. Tiene cancelación y señales periódicas de actividad antes de empezar a escribir.

Los modelos configurados son Haiku 4.5, Sonnet 5 y Opus 5. El móvil puede seleccionar el modelo del turno. El servidor limita la respuesta a 4.096 tokens para Haiku/Sonnet y 16.384 para Opus, contando su razonamiento dentro de ese presupuesto.

**Lo que aún no hace:** no tiene memoria culinaria explícita, resumen persistente del hilo, acceso mediante herramientas a fichas completas ni consulta de precios del banco. No busca información actual en internet. Ver el título de una receta no equivale a conocer sus ingredientes, técnica o coste.

Las instrucciones dicen que conoce la despensa habitual, pero ese dato no se suministra. También imponen un marco italo-mediterráneo y una tendencia a devolver preguntas. Eso puede funcionar para explorar ideas, pero estorbar cuando pides una respuesta directa o una receta terminada. Conviene adaptar el comportamiento a tu petición y a una identidad de cocina que puedas editar.

**Problemas de continuidad:**

- Se envía la señal de «terminado» antes de persistir el mensaje del asistente. Un fallo posterior de base de datos puede dejar una respuesta visible que no reaparece al abrir el historial.
- La clave del mensaje evita duplicar la entrada del usuario, pero no reutiliza una respuesta ya completada: un reintento puede volver a llamar al modelo y añadir otra respuesta.
- No se comprueba la causa de parada del modelo antes de considerar completa la respuesta. Alcanzar el límite de tokens puede producir una receta cortada.
- La base de datos no distingue respuestas parciales, fallidas y completadas. Tampoco guarda el modelo y proveedor en cada mensaje; el modelo inicial de la conversación no describe necesariamente todos sus turnos.

**Mejora:** guardar cada turno con estado e identificador estable, confirmar su finalización después de persistirlo, recuperar una respuesta ya creada en un reintento y detectar truncamientos. Esto es ingeniería de la app, no más inteligencia del modelo.

Fuentes: [contexto](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/anthropic.ts:37>), [instrucciones culinarias](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/anthropic-system.md>), [historial y streaming](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/conversations/[id]/messages/route.ts:137>), [finalización y guardado](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/conversations/[id]/messages/route.ts:259>).

### 4.4. Pasar del chat a una receta

**Ahora:** «Guardar como receta» toma el último mensaje del asistente, hace una segunda llamada a Haiku para estructurarlo y abre el editor. Después se puede revisar y guardar. Es positivo que exista ese paso de revisión.

**Limitación importante:** imagina que el asistente escribe una receta completa y después responde «reduce la sal a 6 g y añade limón». Guardar en ese momento procesa solo esa última respuesta, no la receta completa con su modificación. Además, el botón puede aparecer tras una respuesta que ni siquiera contiene una receta; el esquema permite ciertos resultados vacíos.

**Mejora:** mantener una receta de trabajo asociada al hilo, con su versión actual completa. Cada cambio culinario actualiza ese borrador y tú decides cuándo guardarlo. Como paso intermedio, permitir elegir el mensaje que contiene la receta y comprobar que hay ingredientes y método antes de ofrecer guardarlo.

No conviene ejecutar una segunda extracción en cada mensaje. Solo cuando pides guardar o actualizar una receta concreta.

Fuente: [guardado desde el asistente](<C:/Users/Utente/Desktop/atelier-2-0/apps/mobile/app/(tabs)/asistente.tsx:526>).

### 4.5. Crear, editar, probar, aprobar, duplicar y escalar recetas

**Ahora:** la ficha conserva título, ingredientes, método, notas, porciones, precio de venta, prioridad y estado. Se puede crear a mano o desde una importación, editar, pasar a prueba, aprobar, duplicar, escalar, exportar, retirar y restaurar. El servidor valida que los productos vinculados pertenecen al restaurante y guarda juntos la receta y sus ingredientes estructurados.

**Punto fuerte:** al escalar cantidades no hace falta preguntar a un modelo. Las relaciones numéricas deben seguir siendo deterministas. Si el método contiene cantidades escritas dentro de un párrafo, conviene avisar para revisarlas; tiempos y temperaturas no se deben multiplicar automáticamente por el número de raciones.

**Limitaciones:**

- El borrador que pasa entre pantallas vive en memoria y se consume una vez. El editor no ofrece una persistencia duradera del trabajo sin guardar. Cerrar el proceso o abandonar la pantalla puede perderlo.
- El número `version` no es un historial recuperable: no hay instantáneas de cada revisión.
- Porciones, precio y alérgenos pueden cambiar sin incrementar ese número.
- La marca de aprobación no se limpia al regresar a borrador. Un administrador puede cambiar contenido aprobado conservando su aprobación anterior. Hay que definir si la aprobación corresponde a una versión concreta.
- El guardado desde el móvil puede crear productos nuevos antes de guardar la receta, en peticiones separadas. La operación completa no es atómica.

**Mejora:** autoguardado local, recuperación del borrador, revisión de cambios y aprobación ligada a una versión. No hace falta IA para ninguno de esos cuatro puntos.

Fuentes: [borrador en memoria](<C:/Users/Utente/Desktop/atelier-2-0/apps/mobile/src/lib/recipe-draft.ts:30>), [guardado desde el editor](<C:/Users/Utente/Desktop/atelier-2-0/apps/mobile/app/recetas/nueva.tsx:390>), [estados y versión](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/[id]/route.ts:90>).

### 4.6. Cargar recetas desde foto, PDF, Word o Google Docs

**Ahora:** las fotos se interpretan mediante visión. Para PDF y DOCX se extrae primero texto con bibliotecas y luego se pide a Haiku que lo convierta en una receta estructurada. Google Docs usa la exportación de un documento accesible mediante enlace; no es una conexión con tu Drive privado. Después se buscan productos coincidentes y se abre un borrador editable.

Se comprueban tamaños y firmas de archivo. Los límites son 6 MB para imágenes y 10 MB para documentos. La extracción no inventa porciones cuando no aparecen: conserva ese dato como desconocido.

**Limitaciones:**

- Un PDF escaneado puede no contener texto extraíble y fallar aunque visualmente se lea bien. Esta ruta de recetas es distinta de la ruta visual del estilo de menú.
- Se recorta el texto a 30.000 caracteres. Un documento largo puede quedar incompleto.
- El límite de salida de 2.048 tokens en la extracción de archivos puede quedarse corto para una ficha extensa.
- No hay procedencia por campo —página o fragmento original— ni una indicación fiable de qué parte debe revisarse.
- El límite de tamaño de Google Docs se comprueba después de descargar el contenido; conviene añadir un tiempo máximo y un límite durante la descarga.

**Mejora:** detectar si el PDF tiene texto útil; si no, procesar sus páginas como imágenes. Extraer solo las páginas necesarias, conservar la referencia original y marcar cantidades o rendimientos dudosos. La IA sí aporta valor aquí; las validaciones y conversiones posteriores deben seguir siendo reglas.

Fuente: [extracción de recetas](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/recipe-extraction.ts>).

### 4.7. Banco de productos, coincidencias, precios y mermas

**Ahora:** cada producto conserva nombre, categoría, unidad de compra, precio, merma, proveedor como texto, alias y estado. Hay búsqueda, filtros, duplicación, papelera, historial de precios, pruebas de rendimiento y exportación CSV/PDF. También hay tamaño/peso por pieza para los casos que lo requieren.

El banco **no registra existencias, entradas/salidas, compras o lotes**. Eso encaja con tu idea: disponer de una referencia para calcular cuánto cuesta una receta, sin limitar la creatividad a lo que hay comprado.

La asociación de ingredientes usa normalización, alias y similitud de texto. Los exactos se enlazan; los probables se presentan para confirmar. Las cantidades y unidades se interpretan con un analizador de texto, sin IA. La categoría, unidad y merma inicial de un producto nuevo se proponen mediante reglas.

**Problema de duplicados:** cuando no hay coincidencia, el editor crea productos borrador por separado. El endpoint `from-raw` siempre crea uno nuevo. Si falla el guardado de la receta, quedan productos ya creados; al reintentar pueden aparecer duplicados. También puede ocurrir con ingredientes repetidos o dos personas guardando a la vez.

**Mejora:** una operación de servidor que normalice, reutilice coincidencias inequívocas y guarde de forma consistente; los parecidos se confirman. Permitir guardar una receta con coste pendiente y resolver sus enlaces después, sin obligarte a completar el banco durante una sesión creativa.

Mantendría kg y l como unidades habituales de compra para tu uso. Los gramos y mililitros de las recetas se convierten directamente. Los pesos por pieza solo se pedirían cuando una receta escrita en unidades necesita esa equivalencia. La merma sugerida debería seguir identificada como estimación hasta que la confirmes o midas.

Fuentes: [creación desde ingrediente](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/from-raw/route.ts:43>), [coincidencias](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/match/route.ts>).

### 4.8. Cómo se calcula realmente el coste

Tu descripción es correcta desde el uso: guardas la receta, cargas precios y aparece el coste. Técnicamente el servidor **calcula al leer la receta usando los precios actuales**, en lugar de guardar un importe fijo que haya que recalcular por IA.

El recorrido es: cantidad del ingrediente → conversión a unidad de compra → ajuste de merma cuando corresponde → coste del ingrediente → suma → división por porciones → comparación con precio de venta por ración.

Ejemplo de peso útil: compra a 20 €/kg, merma del 30 %, receta con 200 g útiles. El coste es `20 × 0,2 / 0,70 = 5,71 €`. El motor conserva fracciones de céntimo hasta el redondeo final. No convierte masa en volumen sin una equivalencia válida. Al cambiar un precio, la siguiente consulta utiliza ese nuevo precio; no necesita esperar al trabajo semanal.

La ficha ya avisa de ingredientes sin precio, cantidad interpretable o producto enlazado. También avisa cuando el peso por pieza usa un rango muy amplio.

**Tres cuestiones que corregir o redefinir:**

1. **Merma del 100 %:** el contrato la acepta, pero el cálculo devuelve el precio de compra sin ajuste. Se reprodujo con una prueba. Un rendimiento útil cero debe impedir ese cálculo o marcarlo como no calculable.
2. **Porciones desconocidas:** se asume una. Aunque la pantalla añade «sin porciones definidas», la cifra principal aparece como coste por porción y puede calcularse un porcentaje. Recomiendo mantener visible el coste de la elaboración y dejar pendiente el coste por ración hasta indicar rendimiento.
3. **Coste parcial:** se suman los ingredientes calculables. Eso es útil, pero el listado solo recibe la cifra por porción, sin los contadores de completitud del detalle. Hay que distinguir «completo», «estimado» y «parcial» en todas las vistas que usan esa cifra.

La receta tiene un precio de venta, el plato del menú tiene otro y la versión para cliente puede tener otro más. El porcentaje de la receta no representa automáticamente el margen del precio usado en cada menú.

Hoy se calcula materia prima. No hay un modelo completo de mano de obra, energía u otros gastos. Tampoco hay subrecetas enlazadas —por ejemplo, un fondo utilizado en cinco platos— ni una fotografía del coste histórico de una carta. Son ampliaciones útiles si las necesitas, no requisitos para seguir creando recetas.

Fuentes: [motor de costes](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/products/cost.ts:39>), [porciones y suma](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/products/cost.ts:273>), [tarjeta de coste](<C:/Users/Utente/Desktop/atelier-2-0/apps/mobile/src/components/RecipeCostCard.tsx:56>).

### 4.9. Alérgenos

**Ahora:** se unen los alérgenos de los productos vinculados con los añadidos manualmente a la receta. El resultado alimenta los platos y, si se activa, la leyenda del PDF. Esta propagación es una operación de datos y debe ser determinista.

**El circuito está incompleto:**

- Un producto solo admite un alérgeno, insuficiente para un ingrediente compuesto.
- Los contratos actuales para crear y editar productos no admiten ese campo; tampoco encontré su edición en las pantallas del banco. Existe una función de sugerencia por palabras, pero no está conectada a ese flujo.
- Un producto enlazado con alérgeno vacío no se cuenta como desconocido: la prueba devuelve lista vacía y cero ingredientes sin enlazar.
- El menú y su PDF usan la lista, pero no transmiten la advertencia de información incompleta calculada por el helper.

**Mejora prioritaria:** varios alérgenos por producto, origen de la información y estado «pendiente de revisar / revisado». Distinguir explícitamente «no informado» de «revisado sin alérgenos declarados». Añadir un aviso antes de usar una carta con datos pendientes. La IA puede ayudar a leer una etiqueta o sugerir qué revisar; la confirmación y propagación deben estar bajo control del usuario y de reglas.

Fuentes: [campo del producto](<C:/Users/Utente/Desktop/atelier-2-0/packages/db/prisma/schema.prisma:523>), [contratos de producto](<C:/Users/Utente/Desktop/atelier-2-0/packages/shared/src/api-contract.ts:676>), [unión de alérgenos](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/products/allergens-recipe.ts:29>).

### 4.10. Menús, secciones y versión para cliente

**Ahora:** se crean menús con nombre, temporada y estilo. Se añaden recetas como platos, se organizan en secciones y se modifica su nombre, descripción o precio. Se pueden marcar en servicio, duplicar, retirar y restaurar. Los ajustes de la versión para cliente se guardan aparte y tienen prioridad al exportar, sin reescribir por ello la receta original.

**Discrepancias confirmadas:**

- El detalle excluye recetas enviadas a la papelera. La consulta del PDF no aplica ese filtro y puede seguir imprimiéndolas. Las pruebas de auditoría reproducen la diferencia. El contador de platos también usa un criterio distinto.
- El PDF permite consultar un menú retirado si se conoce su identificador. Hay que decidir una política uniforme para acceder a elementos de la papelera.
- Al añadir o mover un plato, no se comprueba que la sección indicada pertenezca a ese menú. La clave foránea solo garantiza que la sección exista. Una referencia a otra sección puede dejar el plato fuera de los grupos que se imprimen.

**Mejora:** una única preparación de datos para pantalla y PDF, validación de menú-sección-plato y una versión publicada de la carta. Así se puede editar un borrador sin cambiar accidentalmente la carta en servicio. Conservar esa versión también ayuda a recuperar nombres y precios anteriores.

Fuentes: [filtro del detalle](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/projections.ts:85>), [consulta del PDF](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/pdf/route.ts:35>), [añadir plato](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/items/route.ts:33>), [editar plato](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/items/[itemId]/route.ts>).

### 4.11. Copiar el estilo de una foto o PDF

**Ahora:** la referencia se valida, se extraen características visuales, se genera una plantilla HTML/CSS y se intenta refinarla comparándola con una imagen renderizada. La plantilla se guarda como estilo del restaurante y luego recibe los platos de cada menú. La extracción visual y la generación usan Sonnet 5.

Normalmente hay tres llamadas al modelo: características generales, plantilla y refinamiento. Un reintento estructural puede añadir otra. La referencia admite imágenes de hasta 6 MB o PDF de hasta 10 MB y diez páginas. La ruta dispone de hasta cinco minutos.

Los cambios anteriores mejoraron el contrato de refinamiento, la agrupación de platos y columnas, la carga de fuentes y el comportamiento al fallar una nueva carga. Si no se genera un tema válido, se informa del error y se conserva el anterior. La previsualización móvil abre el PDF real. Eso mejora el flujo, pero aún no demuestra fidelidad respecto a una referencia real tuya.

**Por qué todavía no promete una copia exacta:**

- Se utiliza un catálogo limitado de fuentes y salida A4. No se recuperan automáticamente las fuentes originales, logotipos o elementos vectoriales del documento.
- El refinamiento usa platos de ejemplo, no necesariamente el contenido real de tu carta.
- La comparación usa una captura de un viewport con estilos de impresión; no es la rasterización del PDF paginado final. No comprueba todas las páginas.
- El tema refinado se valida estructuralmente, pero no pasa por una segunda verificación visual completa del PDF.
- Hay un estilo global de restaurante, sin historial de estilos ni versión por menú.
- Si un tema guardado falla al exportar, existe un retorno automático a un estilo alternativo. Evita un error, pero puede cambiar el aspecto sin avisarte.

**Flujo que propongo:** conservar el original; extraer tamaño, tipografía, columnas y recursos; preparar una plantilla editable; generar el PDF con tu menú; comparar sus páginas con la referencia; mostrar original y resultado; permitir ajustar y activar la nueva versión. Las comprobaciones de desbordamiento, campos ausentes y paginación pueden ser automáticas. El análisis visual inicial sí merece IA.

Conviene separar dos necesidades: reproducir el mismo documento con el mismo contenido permite mayor fidelidad; conservar su estilo cambiando cantidad de platos requiere reglas de adaptación. Un modelo diferente puede ayudar a interpretar mejor la referencia, pero la fidelidad también depende de esas reglas y de la verificación final.

Fuentes: [carga de estilo](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/restaurant/menu-style/from-image/route.ts:100>), [generación y refinamiento](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/pdf/theme-generate.ts:306>), [render de PDF y captura](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/pdf/render.ts:64>).

### 4.12. Automatizaciones, mantenimiento y planes

**Criticidad:** un producto puede recibir prioridad por categoría/nombre o por representar más del 15 % del coste calculable de alguna receta. Las decisiones manuales se respetan. Hay recálculo manual y un cron configurado los lunes a las 04:00 UTC. Esto prioriza la revisión económica; no mide existencias y no es el proceso que actualiza el coste mostrado de las recetas. Con datos parciales, su porcentaje también es relativo a la parte calculable.

El cron exige una credencial, pero devuelve `ok: true` incluso si algunas operaciones fallan; el detalle informa de los errores. Conviene que el monitoreo detecte esos fallos parciales y reintente por restaurante. La configuración del repositorio no prueba que el cron esté ejecutándose correctamente en producción.

**Planes:** hay enlaces de pago configurables en la web y recepción de eventos de Stripe con comprobación de firma y tratamiento transaccional de duplicados. No hay control del orden entre eventos diferentes; uno atrasado puede sobrescribir un estado más reciente. La restricción de escritura por suscripción está apagada por defecto y depende de `ENTITLEMENTS_ENFORCED`. No comprobé la configuración comercial activa.

**Copias:** existe un script de volcado JSON. Lee las tablas una tras otra, sin una instantánea transaccional común, e incluye todos los modelos. No encontré en el flujo revisado una programación y restauración comprobada que cubra también los archivos externos. No ejecuté el volcado. Antes de depender de las copias, hay que validar consistencia, protección, retención y restauración en otro entorno.

**Observabilidad:** hay logs, Sentry, comprobación de salud y CI con tipos, compilación y pruebas. El chequeo de salud puede considerar omitido un proveedor sin clave y no ejecuta una tarea real de chat o PDF. La cadena de CI todavía tiene pendiente el lint. No ejecuté un análisis actualizado de dependencias y no atribuyo vulnerabilidades concretas a paquetes.

**Escala:** los listados tienen topes sin paginación completa: 200 recetas, 500 productos, 100 ideas y 50 conversaciones; el de menús no tiene un límite equivalente. Los filtros del servidor ayudan, pero hace falta poder recorrer todos los registros. Las operaciones visuales largas aún dependen de una petición abierta; conviene convertirlas en trabajos recuperables con estado y reintentos acotados.

Fuentes: [criticidad económica](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/products/recalc.ts:1>), [cron](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/cron/recalc-criticality/route.ts>), [webhook](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/stripe/webhook/route.ts:88>), [control de plan](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/permissions-guard.ts:130>), [copias](<C:/Users/Utente/Desktop/atelier-2-0/scripts/db-backup.mjs>).

## 5. Qué automatizar y dónde usar IA

| Acción | Solución que conviene | Intervención del chef |
|---|---|---|
| Guardar y recuperar borradores | Autoguardado y sincronización | Decidir cuándo convertirlos en versión final |
| Convertir g/kg y ml/l | Reglas numéricas | Ninguna si las unidades son compatibles |
| Calcular costes y porcentajes | Motor actual, con estados de completitud | Indicar precios, rendimientos y porciones |
| Actualizar costes al cambiar precios | Consultas y actualización de vistas | Revisar consecuencias cuando sean relevantes |
| Avisar de precios pendientes o antiguos | Reglas configurables | Completar o confirmar el dato |
| Relacionar un ingrediente con un producto exacto | Normalización y alias | Ninguna en coincidencias inequívocas |
| Resolver productos parecidos | Reglas primero; IA opcional si aporta | Confirmar variedades o presentaciones dudosas |
| Crear platos y variantes con identidad | IA creativa | Elegir dirección y validar la receta |
| Resolver una consulta culinaria compleja | Modelo potente bajo elección | Aplicar criterio y comprobar el resultado |
| Pregunta sencilla o redacción corta | Modelo económico | Revisar respuesta |
| Aprender preferencias de cocina | Perfil breve editable + extracción puntual | Ver, corregir o borrar recuerdos |
| Leer una receta fotografiada o escaneada | IA visual, con validación estructural | Revisar datos ambiguos |
| Leer facturas/listas de precios, si se añade | Extracción asistida + importación por lote | Confirmar precios y unidades antes de aplicarlos |
| Copiar estilo de menú | IA visual + plantilla y controles de render | Comparar y activar el resultado |
| Generar cada PDF desde un estilo aprobado | Render automático de la plantilla guardada | Revisar la carta cuando cambia |
| Detectar texto cortado o campos ausentes | Validaciones de documento | Resolver el problema señalado |
| Propagar alérgenos confirmados | Relaciones de datos | Confirmar información de origen |
| Sugerir alérgenos desde una etiqueta | IA opcional como ayuda de lectura | Confirmación necesaria |
| Escalar cantidades | Matemáticas | Revisar técnica, tiempos y texto del método |
| Aprobar una receta o publicar una carta | Versiones y permisos | Decisión explícita |
| Calcular criticidad y avisos de impacto | Reglas y datos de coste | Ajustar prioridades |
| Copias, comprobaciones y reintentos | Procesos programados | Atender fallos relevantes |

No añadiría una llamada a IA para decidir si cada botón o cada mensaje necesita IA. El tipo de acción ya permite resolver gran parte de la selección sin consumir tokens.

## 6. Propuesta de dos modelos y memoria contenida

**Estado actual:** las tres opciones del chat y las llamadas de extracción/estilo siguen usando Anthropic. GLM no está integrado. El proveedor aparece en varios puntos; la migración necesita una capa común para mensajes, documentos, respuestas estructuradas, cancelación y registro de uso, además de adaptar las preferencias guardadas.

Mi propuesta para probar con tus casos es:

| Uso | Candidato | Selección |
|---|---|---|
| Diario, preguntas sencillas, extracción y análisis visual inicial | GLM-5.3-Flash | Predeterminado para esas tareas |
| Desarrollo creativo y consultas técnicas exigentes | Claude Opus 5 | Botón «Creativo / técnico», con elección visible |

La documentación actual de GLM-5.3-Flash declara entrada de texto, imágenes, vídeo y archivos, y salida de texto. Por tanto, es candidato para analizar una referencia y generar una plantilla; no genera por sí mismo el PDF final de Atelier. Su razonamiento no se puede desactivar, así que «Flash» tampoco garantiza pocas unidades generadas ni baja latencia en todos los casos. [Documentación oficial de GLM](https://docs.z.ai/guides/vlm/glm-5.3-flash).

Para presupuestar usaría las tarifas normales: GLM-5.3-Flash, 0,15 USD de entrada y 0,50 USD de salida por millón de tokens. La promoción vigente reduce ambos a la mitad hasta el 9 de septiembre de 2026, a las 24:00 UTC+8; no basaría el negocio en ese descuento. [Tarifas oficiales de Z.ai](https://docs.z.ai/guides/overview/pricing).

Opus 5 cuesta 5 USD de entrada y 25 USD de salida por millón; el razonamiento activado por defecto cuenta como salida. Esto refuerza la conveniencia de reservarlo para tareas que lo justifiquen. Es una elección coherente con tu preferencia; no he medido todavía que produzca mejores platos para tu cocina. [Documentación y tarifas oficiales de Opus 5](https://platform.claude.com/docs/en/models/opus-5/whats-new-opus-5).

**Lo que controla realmente el gasto:**

- Un límite de contexto en tokens, no solo veinte mensajes. Veinte mensajes largos pueden seguir siendo muy caros.
- Un perfil de cocina corto: estilo, preferencias, técnicas/equipo y restricciones que tú decidas guardar. Como punto inicial de diseño, unos 300–600 tokens, ajustables tras medir.
- Un resumen de conversación que se actualice al superar un umbral o cerrar una etapa, sin otra llamada automática por cada turno.
- Recuperar solo la receta o los productos relevantes cuando preguntas por ellos. No enviar el banco completo de fondo.
- Guardar las plantillas de menú y reutilizarlas sin IA al exportar; evitar reprocesar una referencia idéntica mediante una huella del archivo.
- Registrar modelo, tarea, entrada, salida, caché, razonamiento disponible y coste estimado de **todas** las llamadas, incluidos errores y reintentos.
- Presupuesto por restaurante y límites distintos para conversación normal, Opus e importación visual. Sin cambios silenciosos a un modelo caro.

Actualmente existe un tope persistente de 120 acciones de IA por usuario y día, configurable. Es un control de cantidad, no un presupuesto monetario. La carga de un estilo puede consumir varias llamadas y reservar solo una acción; la contabilización de tokens se invoca en el chat, pero no cubre la extracción y generación de estilo. Primero mediría esa diferencia.

La migración también exige actualizar la información de privacidad, que hoy menciona Anthropic, y verificar el tratamiento de archivos del nuevo proveedor antes de activarlo.

Fuente local: [cuota y registro de uso](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/lib/ai-quota.ts:14>).

## 7. Prioridades y criterio de aceptación

«Alta» significa corregir antes de ampliar el uso afectado; «media» permite planificar una mejora sin bloquear todas las áreas. Los tamaños son relativos: pequeño, medio o grande, no compromisos de calendario.

| Orden | Cambio | Prioridad / tamaño | Cómo sabremos que está resuelto |
|---|---|---|---|
| 1 | Datos de alérgenos completos y revisables | Alta / grande | Un producto compuesto admite varios; desconocido se distingue de revisado; el aviso llega al menú |
| 2 | Mismo contenido en menú y PDF | Alta / pequeño-medio | Retirar/restaurar una receta produce el mismo resultado en pantalla, contador y exportación |
| 3 | Permisos coherentes | Alta / medio | Cada rol recibe únicamente campos y acciones acordados, comprobados desde la API |
| 4 | Validar sección y menú del plato | Alta / pequeño | Añadir o mover a una sección ajena se rechaza sin modificar datos |
| 5 | Guardar sin perder ni duplicar | Alta / medio-grande | Cierre, falta de red y reintento conservan el borrador y no duplican ideas/productos |
| 6 | Estados fiables de coste | Alta / medio | Merma 100 no produce coste válido; sin rendimiento no hay precio por ración; parciales se señalan en todas las vistas |
| 7 | Turnos del chat persistentes y recuperables | Alta / medio | «Terminado» implica guardado; reintentar no duplica ni repite un trabajo completado |
| 8 | PDF escaneado y guardado de receta conversada | Media / medio | Una receta escaneada se recupera; una corrección posterior conserva la ficha completa |
| 9 | Versiones y aprobación | Media / medio-grande | Se puede recuperar una revisión y saber qué versión fue aprobada |
| 10 | Estilo de menú con comparación real | Alta para tu objetivo / grande | Foto/PDF y salida se comparan con contenido real, sin cortes, en todas las páginas |
| 11 | Medición y dos modelos | Media / medio | Uso por tarea visible; GLM y Opus pasan los mismos casos; presupuesto respetado |
| 12 | Memoria breve y consulta contextual | Media / medio | Puedes editar/borrar preferencias y consultar una receta sin enviar toda la colección |
| 13 | Copias, fallos parciales y eventos de pago | Alta antes de ampliar producción / medio | Restauración probada y eventos atrasados no degradan un estado más reciente |
| 14 | Paginación, cola de trabajos y mantenimiento | Media / medio-grande | Todos los registros accesibles y una carga visual recuperable tras cerrar la app |

## 8. Qué mejoraría de la experiencia de uso

Haría más clara la diferencia entre **crear** y **completar la ficha**. Durante la conversación no deberían interrumpirte precios, categorías y enlaces de productos. Al guardar, una ficha puede decir «receta guardada · coste pendiente de 2 ingredientes» y permitir resolverlo cuando toque.

Añadiría una vista de pendientes útil para cocina: precios que faltan, rendimientos sin confirmar, recetas en prueba y cartas con cambios sin publicar. Cada aviso debe llevar al dato exacto que hay que corregir. Hoy, por ejemplo, el aviso de coste incompleto lleva a productos sin precio aunque el problema pueda ser una cantidad o unidad de la receta.

En el asistente dejaría dos modos comprensibles y una indicación discreta del uso. La memoria tendría una pequeña pantalla «Mi cocina» con lo que se conserva, no una promesa vaga de que aprende todo. Las sugerencias de memoria deberían distinguir preferencias duraderas de lo que decidiste solo para un plato.

En menús mostraría original y PDF resultante, permitiría conservar varias versiones y separaría «borrador» de «en servicio». El objetivo de diseño sería que puedas confiar en lo que vas a imprimir, además de que se vea bien.

Estas son propuestas a partir del flujo y componentes revisados; todavía requieren comprobar tacto, teclado, accesibilidad y legibilidad en tu Android. No he realizado una nueva evaluación visual completa del móvil en esta auditoría.

## 9. Secuencia de trabajo que propongo revisar juntos

**Primero, una entrega de fiabilidad:** alérgenos, menú/PDF, permisos, referencias de secciones, estados de coste y recuperación de borradores. Son mejoras que protegen el trabajo que ya haces.

**Después, cerrar tu objetivo de menú:** usar dos o tres referencias reales —una sencilla, una con columnas y otra de varias páginas— y acordar qué significa conservar fielmente su estilo cuando cambia el contenido. Probar el flujo entero hasta el PDF final, incluyendo nombres largos y platos adicionales.

**Finalmente, cambiar la IA con evidencia:** comparar los dos candidatos con preguntas reales tuyas, varias recetas fotografiadas/escaneadas y las referencias de menú. Medir calidad culinaria, datos omitidos, fidelidad visual, tiempo y consumo. Activar la memoria corta y las consultas selectivas junto con el control de gasto.

Mantendría la identidad de Atelier como cuaderno creativo profesional. Las primeras mejoras deberían hacer más fiable y cómodo ese recorrido, antes de añadir funciones nuevas alrededor.
