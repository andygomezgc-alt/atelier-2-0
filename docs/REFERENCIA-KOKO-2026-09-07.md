# Comparación con la carta de Koko

Referencia del usuario: `Menu Koko luglio 2026_260729_094155.pdf`. Se revisaron visualmente sus dos páginas completas. Se mantuvo el original sin modificar y no se importaron platos ni precios a la base de datos.

## Evidencia del original

- Dos páginas, aproximadamente 216 × 297 mm (612,283 × 841,9 puntos). No es exactamente el ancho de A4.
- Títulos ligeros en mayúsculas, nombres de platos y precios en cursiva fina. Blanco de fondo, tinta oscura verdosa y acentos naranjas.
- Una columna principal de platos; los alérgenos ocupan una columna estrecha a su derecha. Una línea vertical separa el precio. Separadores ondulados naranjas bajo cada título de sección.
- El texto extraíble identifica **Mae Thin Italic**, familia Mae Variable, peso 100. La mayor parte del resto de letras son trazados vectoriales: se ven, pero no son texto ordinario extraíble. El archivo no proporciona una fuente completa reutilizable para cualquier texto nuevo. Por eso interpretar solo el texto del PDF perdería buena parte del menú.
- Precios con dos decimales y coma. La segunda página contiene también un precio por kg y el cubierto, además de la leyenda y el pie.

## Cambios derivados de la comparación

Se reprodujo y corrigió un fallo concreto del renderer: **1250 céntimos se imprimían como «13 €»**. Ahora los precios del PDF conservan dos decimales («12,50 €»). Afecta tanto a los estilos fijos como al estilo personalizado.

El catálogo solo ofrecía Lato 400 y 700. Se incorporaron los archivos reales 100 y 300, normales y cursivos, desde la dependencia instalada, con su licencia. El modelo puede seleccionar pesos finos reales; esto no convierte Lato en Mae. Las fuentes se incluyen localmente y no requieren descargar nada al exportar.

## Muestra de comparación

`output/pdf/koko-muestra-estilo.pdf` es un estudio de la sección **Antipasti freddi**, no una copia terminada de las dos páginas ni el resultado de ejecutar el proveedor de IA con este archivo. Usa el renderer real de la app y una plantilla preparada localmente. No hubo llamadas de pago ni activación de una plantilla en el restaurante.

Se comprobaron los siete nombres en el PDF y se revisó su página rasterizada. Pasan 96 pruebas de PDF y la comprobación de tipos del backend. Los símbolos se tomaron de la referencia para la muestra visual; no se verificaron ingredientes ni se actualizaron los alérgenos de recetas. La leyenda completa se omite en este estudio de una sección.

## Diferencias pendientes

Actualización posterior: los precios por kg, el cubierto y el historial revisable ya están implementados (ver `MENUS-PRECIOS-Y-VERSIONES-2026-09-07.md`). La medición de páginas y una muestra completa de dos páginas se describen en `FIDELIDAD-PDF-2026-09-07.md`. La lista siguiente conserva las observaciones del primer estudio; no representa por sí sola el estado actual.

1. **Tipografía:** para igualar Mae, conviene disponer del archivo editable o de la fuente completa correspondiente. Los fragmentos incrustados en este PDF no garantizan caracteres para futuros platos.
2. **Recursos gráficos:** los iconos y las curvas de la muestra son aproximaciones. Una copia precisa necesita conservar los recursos originales como elementos de la plantilla.
3. **Datos especiales:** el precio por kg debe llevar una unidad de venta propia; no debe confundirse con las unidades del banco usadas para costes. El cubierto necesita representarse sin inventar una receta asociada.
4. **Composición:** queda reproducir y comprobar las dos páginas completas, incluida la leyenda y el pie, y adaptar la distribución cuando cambie el número de platos.
5. **Flujo de la app:** falta comprobar la salida efectiva del analizador con esta referencia, presentar original y propuesta y activar una versión revisada. La muestra no sustituye esa prueba.
