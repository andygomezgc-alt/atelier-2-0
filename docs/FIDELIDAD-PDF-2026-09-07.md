# Fidelidad de la referencia PDF — 7 de septiembre de 2026

El APK queda aplazado por indicación del usuario. No se ha enviado ninguna compilación ni publicado una API durante este bloque.

## Cambios en la app

- Al cargar un PDF válido se mide cada página antes de llamar al modelo. Se usa el viewport de PDF.js, que considera orientación y escala del documento. No hay OCR ni llamadas adicionales a IA.
- Las instrucciones de generación y refinamiento reciben las medidas verificadas. Para documentos de tamaño uniforme se añade una regla de tamaño de página, conservando los márgenes del tema, y se comprueba que el PDF resultante respete esas dimensiones con tolerancia de 0,5 mm.
- Los documentos con formatos distintos conservan esa información en las instrucciones, sin forzar todas las páginas al tamaño de la primera. Su composición requiere revisión visual.
- Las instrucciones piden revisar todas las páginas interiores, sus continuaciones, leyenda y pie. Se eliminó el ejemplo contradictorio que abría etiquetas en la cabecera y las cerraba en el pie.
- La muestra de refinamiento incluye un nombre largo, céntimos, precio por kg y cubierto. El validador comprueba que aparezcan esos textos en el PDF.
- Se rechaza una muestra con texto cuyo rectángulo estimado sobresale de la página. Esto detecta, por ejemplo, un precio que está en el texto extraíble pero queda fuera de la hoja. No certifica ausencia de solapes, contraste ni todos los posibles recortes internos por CSS.
- Se mantiene el máximo de dos llamadas para generar/reparar o generar/refinar el tema. La extracción de la especificación sigue siendo una llamada aparte. Las pruebas de esta entrega no consumieron llamadas a modelos.

No se modifican automáticamente las versiones ya guardadas. La caché de una referencia idéntica continúa reutilizando su versión válida.

## Comprobación con Koko

Referencia original: `C:/Users/Utente/Downloads/Menu Koko luglio 2026_260729_094155.pdf`.

- Medidas leídas: dos páginas de 216 × 297 mm.
- Se preparó una muestra local de las seis secciones, con 31 entradas, precio por kg y cubierto, mediante el renderer de la app.
- Salida: `output/pdf/koko-comparacion-dos-paginas.pdf`, dos páginas. Chromium produce aproximadamente 215,9 × 297 mm, dentro de la tolerancia.
- Se comprobaron los nombres, `60,00 € / kg` y `Coperto 4,00 €`; se inspeccionaron visualmente ambas páginas, incluidas las líneas de separación junto a platos con varias líneas.
- No se importaron platos, precios ni alérgenos a la base de datos. Los símbolos de la muestra son transcripciones visuales para comparar composición, no una revisión de ingredientes.

Esta muestra usa una plantilla preparada localmente para la comparación; no demuestra por sí sola el resultado de una llamada real del analizador. La composición local coloca Primi en la segunda página para reproducir esta referencia concreta. Las cartas con otros contenidos siguen necesitando comprobar sus saltos de página.

## Límites pendientes

La fuente original identificada es Mae Thin Italic; se usa Lato Light Italic como aproximación. Las curvas, símbolos y leyenda tampoco son una reproducción exacta. Falta disponer de los recursos editables originales y verificar la salida del proveedor con la referencia real antes de declarar fidelidad exacta.

## Validación

111 pruebas del bloque PDF y carga de referencias superadas. Comprobación de tipos de API sin errores. Prueba de PDF real con los controles de tamaño y contenido activos superada. Sin migraciones nuevas ni cambios de proveedor.
# Comprobación de tipografía

La generación ahora recibe las variantes reales de cada familia (peso y cursiva), y el PDF usa la fuente de cuerpo declarada como valor por defecto. Chromium espera la carga de fuentes y rechaza archivos que no cargan. Al validar un estilo nuevo también revisa los estilos calculados del texto visible y rechaza familias no declaradas o variantes ausentes, evitando aceptar negritas o cursivas sintetizadas para esas familias.

Un fallo de tipografía permite una reparación dentro del límite existente de dos llamadas de generación de tema; no añade una tercera llamada. Si falla el refinamiento, se conserva la primera versión comprobada. Los estilos antiguos mantienen compatibilidad: no se les aplica la nueva restricción de variantes, aunque sí se comprueban errores de carga.

Verificación: 96 pruebas de PDF, comprobación TypeScript y cinco casos con Chromium real (Lato 300 cursiva válida, familia ausente, Lato 700 cursiva no disponible, archivo dañado y compatibilidad antigua). Esta comprobación encontró y permitió corregir una dependencia de serialización de tsx (`__name`). Cero llamadas de IA en las pruebas.

Límite: comprobar las fuentes disponibles no aporta la fuente original Mae del restaurante ni garantiza una copia exacta. Tampoco verifica la fuente final de cada glifo individual ni detecta todos los solapamientos. La actualización del APK sigue pendiente por decisión del usuario.
