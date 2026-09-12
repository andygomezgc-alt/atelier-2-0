# Precios de menú y versiones de estilo — 7 de septiembre de 2026

Implementado y comprobado en desarrollo y en la base de pruebas. No desplegado en producción ni comprobado todavía en un Android físico.

## Comportamiento

- Cada plato permite alternar entre precio por ración y por kg tocando la unidad junto al precio. El valor se conserva al guardar, duplicar el menú y exportar el PDF. Los campos editables conservan los céntimos.
- «Cubierto y otros cargos» permite añadir, modificar y quitar hasta 20 conceptos con nombre, precio y opción «por persona». Son datos del menú: no crean recetas, no alteran sus costes ni añaden alérgenos. Se copian al duplicar y aparecen en la vista cliente y en el PDF.
- Cargar una foto o PDF crea una propuesta. No modifica automáticamente el estilo activo. Un archivo idéntico con una versión válida guardada se reutiliza sin otra llamada a IA.
- «Propuestas e historial de estilo» permite abrir la referencia disponible, exportar un PDF con la propuesta, activarla o descartarla. Una versión activada se conserva y puede restaurarse posteriormente.
- La activación afecta al menú seleccionado y al resto de menús que usan «Tu estilo», porque el estilo pertenece al restaurante. La pantalla lo advierte antes de activar.
- La primera activación conserva una copia del estilo anterior al historial. Los estilos antiguos que solo tienen una especificación, sin plantilla HTML, siguen siendo exportables y restaurables.
- Si otra persona activó una versión desde que se abrió la pantalla, se rechaza la elección desactualizada y se recarga el historial. No se sustituye silenciosamente el estilo nuevo.
- Las propuestas y su PDF requieren permiso de edición y están limitados al restaurante de la sesión. La activación y el descarte se coordinan en transacciones con bloqueo por restaurante.
- Al eliminar la cuenta del último miembro o el restaurante, también se recogen las referencias de las versiones para limpiar sus archivos. Descartar una propuesta conserva el archivo mientras exista su registro, ya que puede ser compartido por otra versión.

## Comprobaciones

- API: 494 pruebas superadas entre la ejecución general y las repeticiones de suites afectadas. Dos suites de autenticación/salida agotaron el tiempo de arranque con la concurrencia general; sus 16 pruebas pasaron al repetir con dos procesos.
- Móvil: 120 pruebas superadas. Contratos compartidos: 245. Traducciones: 5. Total: 864.
- Comprobación de tipos de API y móvil sin errores.
- Exportación JavaScript/Hermes de Android completada; no equivale a instalar un APK ni a probar los gestos, teclado y compartición en un dispositivo físico.
- Prueba HTTP con un restaurante y usuario sintéticos en la base de pruebas: guardar kg y coperto, recargar, duplicar, exportar una propuesta sin activación, activar, conservar copia anterior, rechazar una activación desactualizada, restaurar y descartar. No se creó ninguna receta por el coperto.
- El ensayo real detectó y permitió corregir la serialización de un valor nulo de Prisma al guardar un estilo antiguo. La repetición completa pasó. Los registros temporales se eliminaron.
- PDF real inspeccionado por extracción de texto y visualmente: `output/pdf/koko-prueba-precios-versiones.pdf`, una página, con `60,00 € / kg` y `4,00 € a persona`.
- Ninguna llamada a modelos de IA durante estas comprobaciones. El tema de prueba es una adaptación local ya preparada del documento Koko.

## Datos y despliegue

Migración aditiva: `20260907020000_menu_units_and_style_versions`. Añade `MenuItem.priceUnit`, `MenuFolder.serviceCharges`, `MenuStyleVersion` y el identificador del estilo activo. Aplicada únicamente a la base de pruebas verificada. La API local se reinició después.

La versión nueva de móvil necesita esta API y migración antes de publicarse. El endpoint de carga devuelve ahora una propuesta, no una activación automática: publicar ambas partes coordinadamente.

El historial muestra las 100 versiones no descartadas más recientes y, adicionalmente, la activa si es más antigua. No hay paginación para recuperar otras versiones fuera de ese conjunto. Una referencia original solo puede abrirse si su subida al almacenamiento fue posible.

## Siguiente prueba con el usuario

1. En Android, abrir un menú de prueba, cambiar un plato a €/kg y comprobar un precio con céntimos.
2. Añadir «Coperto», 4 €, por persona; guardar, cerrar y volver a abrir.
3. Subir el PDF Koko: comprobar que el menú conserva el estilo activo mientras aparece la propuesta.
4. Abrir la referencia y el PDF resultante, activar la propuesta, probar restauración y descarte.
5. Revisar la carta completa de dos páginas contra Koko antes de decidir la fidelidad final.

El PDF de este bloque comprueba datos y funcionamiento, no certifica una reproducción exacta de Koko. Siguen pendientes la fuente Mae Thin Italic, los ornamentos/iconos y la fidelidad de la carta completa. Este bloque tampoco cambia el proveedor de IA.
