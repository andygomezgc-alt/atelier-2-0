# Costes por ingrediente — A (estado visible y arreglable) + B (peso ↔ volumen)

- **Rama:** `feat/costes-por-ingrediente` (sale de `main` 68e3f53)
- **Espejo Engram:** `odd/costes-por-ingrediente/tasks`
- **Origen:** diagnóstico del 12-10-2026 (Engram `atelier/costes-receta-diagnostico-2026-10`). Andy aprobó «A y B juntas».

## Objetivo
Que el chef vea, ingrediente por ingrediente, por qué una receta tiene coste parcial y lo arregle ahí mismo; y que el sistema sepa convertir gramos a litros (y al revés) cuando el producto declara cuánto pesa un litro.

## Problema
«Calamar embutido al pimentón» (Kokoo, prod): 12 ingredientes enlazados y con precio, pero 7 «sin costo». Seis en g contra productos comprados por litro (`convertUnit` solo hace g↔kg y ml↔l) y uno en g contra un producto por unidad sin peso por pieza. El aviso rojo abre la lista de productos con precio 0, que en este caso está vacía; ni la receta ni esa lista dicen la causa.

## Por qué
Comprar por litro y pesar en gramos es lo normal en cocina (aceite, nata, clara). Sin equivalencia ni explicación, el chef carga precios y el coste sigue en rojo.

## Decisiones
- Columna nueva `Product.gramosPorLitro Decimal? @db.Decimal(7,2)` con CHECK > 0. Significa «1 litro de este producto pesa X g». Migración solo aditiva.
- No se rellena sola en la base: nunca se inventa una equivalencia. La hoja de arreglo sugiere un valor (aceites 920, el resto 1000) que el chef confirma.
- El motor de coste convierte g/kg ↔ l/ml con `gramosPorLitro`; aplica merma igual que el resto de la rama de peso/volumen.
- El coste devuelve líneas por ingrediente con un estado: `ok`, `no_product`, `no_price`, `no_quantity`, `needs_density`, `needs_piece_weight`, `incompatible_unit`, `invalid_merma`. Los contadores agregados actuales se mantienen (compatibilidad con binarios ya publicados).
- Peso por pieza: se guarda en el producto como pezzatura `g_per_piece` con min = max.
- Móvil: la receta lista los ingredientes con su estado; tocar uno no resuelto abre una hoja que permite cambiar unidad de compra, precio, «1 l pesa … g» o «1 unidad pesa … g» según el caso. `no_product` y `no_quantity` llevan al editor de la receta. El aviso rojo baja a la lista de ingredientes en vez de abrir el banco.
- La ficha del producto muestra «1 litro pesa (g)» cuando la unidad de compra es kg, g, l o ml.

## Alcance autorizado
A1, A2. Fuera de alcance (propuestas C y D): limpiar nombres al crear borradores, merma por defecto en productos limpios, aprovechamientos sin coste, re-enlace automático y productos borrados en el coste.

## Restricciones
- TDD estricto: activado (fuente `~/.claude/CLAUDE.md`), runner `vitest run` en cada paquete. RED observado antes de implementar.
- Migración: SQL generado con `prisma migrate diff` contra HEAD; solo se aplica a la base de pruebas si hace falta. Producción la aplica el build de Vercel al fusionar.
- Textos en es/en/it; la app en español usa tuteo.
- Compatibilidad: los campos nuevos del contrato son opcionales para no romper binarios publicados.
- Commits convencionales, sin Co-Authored-By.

## Tareas
| ID | Tarea | Ruta | Motivo del disparador |
|---|---|---|---|
| A1 | Columna + migración, contrato shared, motor de coste con líneas y densidad, API de productos acepta el campo, proyección expone las líneas | Delegada (writer Opus) | 2+ archivos no triviales |
| A2 | App: estado por ingrediente, hoja de arreglo, aviso rojo, campo en la ficha del producto, i18n | Delegada (writer Opus) | 2+ archivos no triviales, UI |

Orden: A1 → A2.

- [x] A1 — backend y contrato (migración `20261012230000_product_gramos_por_litro`; commit en «Progreso»)
- [ ] A2 — app móvil

## Criterios de aceptación
- A1: 40 g de aceite con producto por litro a 5 €/l y `gramosPorLitro` 920 cuesta 40/920 × 5 € (con merma); sin `gramosPorLitro` la línea es `needs_density`. Pieza contra litro o cualquier cosa contra caja → `incompatible_unit`. g contra unidad sin peso → `needs_piece_weight`. Las líneas cubren todas las filas en orden y los contadores agregados no cambian para los casos existentes. POST/PATCH de producto aceptan y validan `gramosPorLitro` (> 0, null para quitarlo).
- A2: la receta muestra cada ingrediente con su estado; la hoja guarda en el producto y la receta se recalcula; el aviso rojo lleva a la lista; la ficha del producto edita la equivalencia; sin `lines` (API vieja) la receta se ve como antes.

## Comprobaciones
- `pnpm -C packages/shared exec tsc --noEmit`, `pnpm -C packages/shared test`
- `pnpm -C apps/api exec tsc --noEmit`, `pnpm -C apps/api test`
- `pnpm -C packages/i18n exec tsc --noEmit`
- `pnpm -C apps/mobile typecheck`, `pnpm -C apps/mobile test`

## Entrega
- Previsión: ~900 líneas en total (más de 400). Estrategia de entrega: pendiente de preguntar a Andy antes del PR.
- RDD: activado (global). Evaluar cada commit con `gentle-ai review assess`.

## Progreso
- 12-10-2026: documento creado; rama creada desde main 68e3f53.
- A1 (writer Opus, delegado):
  - RED observado por el writer, con los fallos esperados: shared 9, api 43 de 91, y las rutas POST, PATCH y duplicate.
  - GREEN: shared tsc y 301 pruebas; db tsc; api tsc y 1423 pruebas.
  - `auth-flow` y `leave` fallaron por el timeout de arranque ya conocido; aisladas pasan 26/26.
  - mobile typecheck OK.
  - Comprobación del padre: `cost.test.ts` da 56/56 y la migración es aditiva.
  - Desvíos:
    - el duplicado de un producto copia `gramosPorLitro`;
    - el recálculo de criticidad incluye la densidad;
    - en las líneas, `id` y `position` son opcionales en la entrada del motor (la proyección siempre los pasa).
  - Contrato: `cost.lines` opcional, solo en el detalle; `gramosPorLitro` opcional en `ProductListItem`.

## Siguiente paso
A2.
