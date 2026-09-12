# Escaneo para distintos restaurantes

## Corrección implementada

La aceptación de un estilo nuevo ya no depende solamente de una carta italiana de ocho platos. Se imprime además una segunda carta local con seis secciones, 25 platos, nombres largos, texto en español e inglés, un plato sin sección y sin temporada, cargos ni alérgenos. Se comprueban contenido, límites de página y fuentes. Esta segunda carta nunca se envía al modelo; permite hasta 12 páginas frente a las cuatro de la muestra enviada a refinamiento.

Los fallos de composición comprobados permiten una reparación con el motivo del rechazo. Se mantiene el máximo de dos llamadas de tema: generación y reparación, o generación y refinamiento. La extracción de especificación de estilo sigue siendo una llamada aparte. Un fallo de infraestructura no provoca ese reintento. La comprobación adicional requiere dos renderizados por versión candidata y añade tiempo local, aunque no tokens de entrada al modelo por la segunda carta.

## Casos comprobados

Se crearon tres referencias sintéticas, independientes de Koko:

- Bistró: A5 vertical, flujo de una columna; carta extensa en cuatro páginas.
- Brasserie: A4 horizontal, dos columnas; carta extensa en tres páginas.
- Café: A4 vertical, fondo oscuro; carta extensa en tres páginas.

Chromium y PDF.js comprobaron los tres casos y rechazaron una variante defectuosa que pasa con una carta corta pero oculta las secciones posteriores. Se renderizaron e inspeccionaron las diez páginas de contenido variable. Las pruebas de la ruta también comprueban el formato y los filtros por restaurante para los tres casos. No se escribieron datos de restaurantes ni se desplegó la aplicación.

Reproducción desde `apps/api`:

```powershell
node ../../packages/db/node_modules/tsx/dist/cli.mjs scripts/check-menu-designs.ts
```

Los PDF y `resultados.json` están en `output/pdf/multi-restaurante/`. La ejecución local consumió cero llamadas a modelos. El script dispone de un modo `--live` para una comparación posterior del generador de temas; no fue ejecutado y no prueba por sí solo la ruta completa de subida/extracción/almacenamiento.

## Pendiente para cerrar la validación del escaneo

Las referencias y plantillas se prepararon localmente: este resultado comprueba reutilización y composición, no reconocimiento visual por IA. Sigue pendiente probar el proveedor con PDF y fotografías reales (perspectiva, sombras, baja calidad), revisar la fidelidad visual de su salida y registrar su consumo. Se consultó al usuario si desea autorizar esa prueba pequeña o mantener este bloque sin tokens de IA.

La fuente original, logos y ornamentos pueden requerir recursos adicionales. La comprobación no garantiza contraste ni ausencia de todos los solapamientos, ni da soporte universal a alfabetos fuera de las fuentes disponibles. Los estilos ya guardados y reutilizados desde caché no se regeneran automáticamente. El APK continúa aplazado.
