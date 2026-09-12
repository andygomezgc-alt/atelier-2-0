# Estilo de menú: importación, comprobación y exportación

Entrega iniciada el 6 y cerrada el 7 de septiembre de 2026. Cambios locales; no hay despliegue de producción, cambio de proveedor ni migración nueva de base de datos.

## Qué se corrigió

- **La comparación visual usa el PDF real.** El refinamiento recibe el documento paginado que genera Chromium, en lugar de una captura del viewport. La plantilla inicial y la refinada se imprimen y comprueban antes de aceptarse. Si falla el refinamiento se conserva la versión inicial ya comprobada; si falla la inicial no se sustituye el estilo anterior.
- **Control automático de la muestra.** El PDF de prueba debe contener los nombres de sus platos y secciones, tener como máximo cuatro páginas y ocupar menos de 4 MB. Estos límites afectan a la muestra enviada a visión, no al tamaño del menú que exporta el usuario. Se rechazan respuestas del modelo cortadas por el límite de tokens. PDF.js libera los documentos que abre.
- **Formato de página.** Chromium respeta `@page`, incluida la orientación y formatos como A5 horizontal. El prompt pide conservar el formato interior del PDF cuando pueda deducirse, con A4 como alternativa. Las fotos se interpretan como una hoja plana. No se promete deducir medidas físicas exactas de una fotografía.
- **Reutilización sin IA.** Se guarda una huella SHA-256 y el MIME de la referencia junto con la plantilla. Si se vuelve a cargar el archivo idéntico al del estilo actual y este sigue siendo válido, se devuelve lo guardado sin reservar cuota, generar otra plantilla ni subir otra referencia. Exportar un menú sigue siendo una operación de render, sin IA.
- **Gasto medido y acotado.** Una carga nueva utiliza una llamada para el resumen visual y hasta dos para la plantilla: generación y refinamiento, o generación y reparación estructural. Se registran los tokens de cada respuesta, incluidas las respuestas que luego se descartan. Un fallo de telemetría no invalida el resultado.
- **Protección frente a cargas simultáneas.** El guardado compara de forma atómica la plantilla, el resumen y la referencia anteriores. Una carga lenta no pisa un estilo cambiado durante la generación. Si otra petición terminó con el mismo archivo, se recupera ese resultado; si era otro estilo, se informa del conflicto. La limpieza de referencias evita borrar un archivo que pudo quedar confirmado tras perderse la respuesta del commit.
- **Errores de PDF explícitos.** Si una plantilla está corrupta, incompleta o falla al renderizarse, se informa del error en lugar de imprimir silenciosamente un diseño alternativo. Los estilos antiguos que solo tenían un resumen visual siguen usando su renderer original. El PDF no se cachea durante un minuto después de modificar texto o precios.
- **Fotos y errores en el móvil.** Se utiliza la calidad máxima solicitada al selector y se conserva el MIME real. Una imagen PNG ya no se declara artificialmente como JPEG. Los errores descargados como JSON se interpretan, se traducen y se eliminan del archivo temporal; no se comparten como si fueran PDF.
- **Edición antes de exportar.** La vista del cliente mantiene un borrador acumulado y serializa sus guardados. Descargar o cerrar espera los cambios, incluido el texto aún dentro del debounce y las operaciones pendientes de alérgenos, y reconcilia los datos del menú. Si falla el guardado, la vista permanece abierta para reintentar. El interruptor de alérgenos responde inmediatamente. Editar el nombre del restaurante respeta el permiso de administrador.

## Verificación

**842 pruebas automatizadas pasan:** API 477, móvil 119, contratos y utilidades 241 e idiomas 5. En la batería inicial del backend dos suites agotaron el tiempo de sus imports al arrancar en paralelo; sus 16 casos pasaron al ejecutarlas por separado. Tras los últimos ajustes se repitieron los archivos afectados.

El backend y el móvil pasan la comprobación de tipos. La exportación de Android terminó con 2287 módulos y un paquete Hermes de 6,6 MB, en `tmp/android-menu-style-2026-09-07`. Esta exportación no equivale a instalar un APK ni a probar la interfaz en un teléfono físico.

Las regresiones reprodujeron antes del arreglo el reanálisis de un archivo ya guardado, la sustitución de un estilo modificado durante otra carga, la falta de limpieza de referencias y los PDF que cambiaban de diseño o quedaban sin contenido.

Se generaron con Chromium tres PDFs sintéticos: una columna, dos columnas con nombres largos y un menú de tres páginas. Se extrajo su texto y se revisaron visualmente las cinco páginas rasterizadas. No se encontraron textos cortados ni solapamientos en estas muestras. El mismo script comprobó el rechazo de contenido recortado, el límite de páginas de la muestra, JavaScript desactivado y el formato A5 horizontal. El script y los artefactos de revisión están en `tmp/pdfs/`, excluidos del repositorio.

Las pruebas de rutas y del proveedor usan dobles de prueba. No se hicieron llamadas de pago a modelos ni escrituras en la base real durante esta entrega. La generación de muestras sí ejecutó el renderer y PDF.js reales.

## Lo que todavía necesita una referencia real

- No se ha recibido una foto o PDF del usuario para comparar el parecido visual. Las comprobaciones de texto y páginas no garantizan colores, contraste, alineación, ausencia de todo solapamiento ni fidelidad tipográfica.
- Las fuentes siguen limitadas al catálogo instalado. La extracción no incorpora automáticamente fuentes comerciales, logotipos o imágenes del original.
- El estilo sigue siendo global para el restaurante y se activa al cargarlo. Falta separar propuesta y activación, conservar versiones recuperables y mostrar original y resultado juntos. La vista del PDF usa el mecanismo de compartir del dispositivo.
- La huella reutiliza el archivo idéntico del estilo **actual ya guardado**. Dos peticiones que arrancan antes de que termine la primera todavía pueden consumir ambas generaciones; esta entrega no introduce una cola duradera de trabajos ni un historial de referencias.
- El original continúa dependiendo del almacenamiento Blob configurado. Si la subida falla, se conserva la plantilla nueva pero puede no haber archivo de referencia disponible. El tope de imágenes sigue siendo 6 MB, y el de PDF 10 MB y diez páginas.
- El borrador acumulado de la vista del cliente protege cambios durante la sesión. No añade historial, colaboración simultánea entre dispositivos ni recuperación de esa vista tras cerrar el proceso móvil.
- La prueba física en Android, la comparación con el menú del usuario y el despliegue quedan pendientes. No se cambiaron los modelos del chat.
