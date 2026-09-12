# Revisión de recetas, banco de productos y costes

Auditoría inicial sobre `8af2105`, seguida de correcciones locales autorizadas. No se han consultado datos privados del restaurante ni escrito en producción.

## Estado de las correcciones

- Conversiones entre piezas y peso restringidas a gramos/kilogramos; unidades incompatibles quedan sin coste computable.
- Cálculo sin redondeos intermedios, incluyendo precio efectivo del banco y su visualización con precisión de cuatro decimales.
- Criticidad calculada con el mismo motor de costes, agregando apariciones repetidas del producto y excluyendo recetas/productos borrados.
- Autocompletado conserva cantidad y unidad; búsqueda por nombre sin la cantidad. Cambiar solo la cantidad conserva el vínculo y los ajustes; cambiar el ingrediente borra ajustes del producto anterior.
- Edición conserva cantidades, unidades, calibre y overrides. La API respeta valores explícitos, incluidos null.
- Porciones transportadas desde extracción de texto, foto, PDF/DOCX y Google Docs hasta el editor y la creación. Campo editable, validado entre 1 y 1000, con mensajes ES/IT/EN. Si no constan, permanecen desconocidas.
- Corregido el orden de hooks de la tarjeta de costes al pasar entre recetas con/sin ingredientes estructurados.

Los hallazgos siguientes documentan el comportamiento anterior para conservar la evidencia de la auditoría.

## Flujo confirmado

1. El editor busca coincidencias de los ingredientes contra el banco al guardar. Las exactas se enlazan; las probables se presentan al usuario; para ingredientes sin coincidencia se crean productos borrador sin precio.
2. La API guarda receta e ingredientes estructurados en una transacción y valida que los productos sean del restaurante.
3. Las respuestas de recetas calculan el coste con los precios, cantidades, unidades, mermas y pesos por pieza actuales. No hay una llamada a IA para este cálculo.
4. Cambiar precios o registrar una prueba de rendimiento invalida la caché de recetas en el móvil. El detalle vuelve a consultar al recuperar el foco. No es una actualización en vivo entre dispositivos.
5. Los costes incompletos tienen contadores de ingredientes sin precio, sin medida o sin vincular. El coste parcial puede mostrarse acompañado de ese aviso.

## Hallazgos reproducidos ejecutando las funciones reales

### P1: conversiones incompatibles producen importes

`apps/api/lib/products/cost.ts`, ramas de conversión piezas/peso.

Las ramas comprueban si un lado es una pieza, pero no exigen que el otro sea kg o g. Con un peso de 100 g por pieza, dos piezas enlazadas a un producto de 10 EUR/l producen 2.000 EUR. También 100 ml enlazados a un producto de 2 EUR/unidad producen 2 EUR usando ese peso, aunque falta una equivalencia de volumen. Deben quedar sin medida computable hasta disponer de una conversión válida.

### P1: redondear el precio antes de multiplicar puede inflar el coste

`apps/api/lib/products/cost.ts`, `realCost` y su uso dentro de `computeRecipeCost`.

Ejemplo: 1.000 g útiles, compra a 0,01 EUR/g, merma del 20 %. El coste matemático es 12,50 EUR; la función devuelve 20 EUR porque redondea 1,25 céntimos/g a 2 antes de multiplicar. Conservar precisión intermedia y redondear el importe final evitaría este error. Revisar coherencia con la visualización del precio efectivo del producto.

### P2: criticidad económica ignora cantidades y unidades

`apps/api/lib/products/recalc.ts`, construcción de `recipeTotals` y `productShares`.

Ejemplo: 1 g de pimienta a 30 EUR/kg y 1 kg de arroz a 5 EUR/kg. La pimienta aporta 0,03 EUR de 5,03 EUR (0,60 %), pero el recálculo le atribuye el 85,71 % y la marca de alta criticidad económica. Compara precios de compra, no costes de las cantidades usadas. Este fallo afecta a la clasificación del banco; es distinto del total de la receta.

## Hallazgos adicionales por seguimiento del código

### P2: elegir una sugerencia borra la cantidad escrita

`apps/mobile/src/components/IngredientAutocomplete.tsx`, `handleSelect`.

La selección asigna `rawText: p.name`, descartando el texto anterior. Si el usuario escribe una cantidad y selecciona después un producto, debe volver a introducirla o el ingrediente quedará sin medida para el cálculo. La sustitución también descarta el override de peso de la fila.

### P2: las porciones no se extraen ni se guardan en la creación inicial

`apps/api/lib/recipe-extraction.ts`, `ExtractedRecipeSchema`; `packages/shared/src/api-contract.ts`, `CreateRecipeRequestSchema`; editor de nueva receta.

La extracción conserva título, ingredientes, método y notas, pero no un campo estructurado de porciones. El coste por ración asume una cuando el campo es nulo; la tarjeta avisa «Sin porciones definidas» y permite corregirlo. Una receta importada para cuatro personas no queda automáticamente dividida entre cuatro hasta completar ese dato. Es una limitación del flujo actual, no un fallo de la división cuando las porciones están definidas.

### Riesgo de edición: pérdida de campos estructurados

El traspaso desde el detalle al editor conserva texto, producto y peso de cálculo, pero omite `qty`, `unit`, `pezzatura` y `mermaOverridePct`. El PATCH reemplaza las filas y vuelve a interpretar el texto, dejando el override de merma en null. Esto puede modificar el coste de ingredientes con valores estructurados que no coincidan exactamente con el texto. No se ha reproducido mediante interacción con el móvil.

## Verificación y límites

Verificación posterior a las correcciones: **750 pruebas aprobadas** (API 415, compartido 238, móvil 92, traducciones 5) y `pnpm -r typecheck` aprobado en los cinco paquetes. Se añadieron 24 casos de regresión, incluyendo guardar receta → añadir/cambiar precio → consultar coste sin volver a guardar. Dos suites agotaron el timeout de preparación en la ejecución paralela inicial; pasaron aisladas y la API completa pasó con `--maxWorkers=2 --minWorkers=1`. Graphify actualizado con `graphify update .`.

Referencia de la auditoría inicial:

- API: 128 pruebas existentes aprobadas en 19 archivos (productos, costes, proyecciones, recetas, exportación, escalado y restauración).
- Paquete compartido: 238 pruebas aprobadas.
- Móvil: 86 pruebas aprobadas.
- Total: 452 pruebas existentes aprobadas.
- Arnés de diagnóstico en memoria: ejecutó el código TypeScript real de coste y criticidad; confirmó el cálculo normal, el cambio de precio y los tres fallos numéricos anteriores. La criticidad se ejecutó con datos sintéticos y base simulada, en modo dry-run.
- No se efectuó prueba visual en dispositivo ni integración con una base real. Las pruebas existentes aprobadas no cubren los fallos adicionales encontrados.

Se mantiene el coste automático, independiente de la futura migración del proveedor de IA. Las correcciones requieren publicar el backend y distribuir la actualización móvil para estar disponibles en producción. No se ha ejecutado una migración de datos: las porciones ausentes en recetas antiguas deben completarse; no se infieren retrospectivamente.
