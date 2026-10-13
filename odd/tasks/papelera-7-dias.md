# Papelera con vaciado a los 7 días, más merma de productos limpios

- **Rama:** `feat/merma-limpios` (sale de `main` 3907e39)
- **Espejo Engram:** `odd/papelera-7-dias/tasks`
- **Origen:** pedido de Andy del 13-10-2026: «después de una semana en la papelera se eliminen», en productos, recetas y menús. También la propuesta D: merma sugerida 0 para productos que ya vienen limpios.

## Objetivo
Lo que pasa más de 7 días en la papelera (productos, recetas, menús) se borra solo y para siempre. La app avisa del plazo.

## Por qué
Hoy la papelera no caduca: crece sin límite y los productos viejos ensucian el banco.

## Decisiones
- **Mecanismo:** un cron diario nuevo en Vercel (`/api/cron/purge-trash`), con la misma autenticación que los crons existentes. Recorre todos los restaurantes. El corte es `deletedAt < ahora - 7 días`.
- **Orden de borrado**, dentro de transacciones por lotes:
  1. menús en la papelera (en cascada se van secciones, platos y overrides);
  2. platos de menús activos que apuntan a recetas que se van a borrar, porque `MenuItem.recipeId` es Restrict;
  3. recetas en la papelera (en cascada se van sus ingredientes);
  4. productos en la papelera (en cascada se van las pruebas de rendimiento y el historial de precios, y `RecipeIngredient.productId` queda en null).
- **Sin migración.** Se registra cuántas filas se borraron por tipo. Nada se borra antes de los 7 días.
- **App:** las tres pantallas de papelera muestran «Se borra para siempre a los 7 días». Textos en es/en/it, en tuteo.
- Si la política de privacidad menciona la papelera, se actualiza.

## Tareas
| ID | Tarea | Ruta | Disparador |
|---|---|---|---|
| D | Merma sugerida 0 para productos limpios y más pescados | Inline (padre) | 1 regla y 2 llamadas |
| P1 | Lógica de vaciado + cron + `vercel.json` + pruebas | Delegada (writer Opus) | 2+ archivos no triviales |
| P2 | Aviso en las 3 pantallas de papelera + i18n (+ privacidad si aplica) | Delegada (mismo writer) | Ídem |

- [x] D (`4631609`): TDD; RED por función inexistente, después 3 fallos esperados en el alta y los borradores; GREEN api 1616/1616.
- [x] P1 (`811dd3b`): RED 13/13 por la razón correcta → GREEN 13/13; api 1629/1629; cron `30 3 * * *`; presupuesto de 240 s con `complete:false` para seguir al día siguiente
- [x] P2 (`0609c9c`): i18n 94/94 y mobile 541/541; aviso como cabecera de las 3 papeleras; la privacidad (solo es) menciona los 7 días

## Criterios de aceptación
- P1:
  - un elemento con 8 días en la papelera se borra y uno con 6 no;
  - un elemento activo nunca se toca;
  - una receta en la papelera que sigue en un menú activo se borra sin error, y su plato desaparece del menú;
  - un producto borrado deja los ingredientes de las recetas sin enlazar;
  - el endpoint sin el secreto del cron devuelve 401;
  - el cron queda registrado en `vercel.json`.
- P2: las 3 papeleras muestran el aviso y hay paridad de textos.

## Restricciones
- TDD estricto con `vitest run`.
- Sin borrar nada a mano en producción: el primer vaciado real lo hace el cron después de publicar.
- Commits convencionales, sin Co-Authored-By.

## Entrega
- Estrategia `single-pr`, junto con D.
- La parte de la app necesita una build nueva.
- RDD activado.

## Progreso
- Comprobación del padre: las pruebas de `trash-purge` y del cron dan 13/13.
- Producción, solo lectura: hoy hay en la papelera 1 receta y 14 productos, y ninguno lleva más de 7 días, así que la primera pasada no borra nada. Lo de hoy se borra el 20-10.
- Riesgos anotados:
  - un menú en la papelera pierde los platos cuyas recetas vencen;
  - hay una carrera mínima si se restaura algo durante el borrado;
  - no hay prueba de integración contra Postgres.

## Siguiente paso
RDD y PR.
