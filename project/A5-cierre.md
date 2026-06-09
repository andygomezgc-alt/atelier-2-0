# Sub-paso A.5 — Pezzatura · Cierre

**Fecha de cierre**: 2026-05-19
**Restaurante de validación**: Dev Kitchen
**Recetas de validación**: Gambero Rosso di Mazara, Ricciola in Bianco

---

## 1. Qué hace el sistema ahora

Antes de A.5, los ingredientes que se medían por unidad (gamberi, pichón, ricciola
entera) no entraban al cálculo de costo de la receta porque no había forma de
saber cuánto pesa una pieza. Caían en el bucket "no medible" y el costo total
se subestimaba sistemáticamente. El chef tampoco tenía manera de marcar variabilidad
de calibre (un gambero 15/20 pesa el doble que un 30/40).

A.5 cierra ese hueco con un modelo estructurado de **pezzatura** (calibre)
persistido en el banco. Los cambios concretos:

### Modelo de datos
- `Product` tiene 3 campos canónicos nuevos: `pezzaturaMode` (`pz_per_kg` o
  `g_per_piece`), `pezzaturaMin`, `pezzaturaMax`. Los tres van juntos por
  CHECK constraint en DB (todos null o todos no-null).
- `RecipeIngredient` tiene `pesoCalculoG` opcional — override del peso por
  pieza para una receta puntual. Representa **siempre** el peso bruto de la
  pieza entera (antes de pelar/limpiar). Si el chef quiere considerar peso
  útil ajusta la merma del producto en el banco, no este override.

### Parser + auto-detección
- `parsePezzatura(input, category, name)`: parsea texto libre del chef
  (`"15/20"`, `"2-4 kg"`, `"60 g/pz"`, `"U/8"`, etc.) en formato canónico.
  Tolerante a separadores `/`, `-`, `a`, espacio. Tolerante a decimales con
  coma o punto. 69 tests unitarios.
- `detectPezzaturaFromName(name, category)`: extrae calibre embebido en el
  nombre cuando lo hay (ej: "Gamberi 15/20" → `pz_per_kg 15/20`). Se corre
  silencioso al crear un producto (POST `/api/products`, POST `/api/products/from-raw`).
- `resolvePezzaturaMode(name, category)`: decide qué modo aplica por categoría
  + keywords del nombre (marisco vs pescado entero, ave vs corte de carne, etc.).
- Todo el módulo vive en `@atelier/shared` — cliente y server lo usan idéntico.

### Costo con pezzatura
- `computeRecipeCost` ahora maneja 4 casos:
  1. Peso/peso (kg/g/l/ml): flujo viejo con merma.
  2. Piezas → producto comprado por unidad: trivial, `qty × precio`, **sin merma**.
  3. Piezas → producto comprado por peso (kg/g): usa pezzatura para resolver
     peso total, **sin merma** (el chef compra piezas enteras, la merma ya está
     pagada).
  4. Peso → producto comprado por unidad: pezzatura inversa, **sin merma**.
- Override `pesoCalculoG` siempre gana sobre el banco.
- Si `pezzaturaMax / pezzaturaMin > 2` (rango ancho), se reporta warning
  `wide_range` en `RecipeCost.wideRangeCount` y en cada ingrediente afectado
  (`RecipeIngredient.pezzaturaWarning`). `RecipeCostCard` muestra texto suave:
  "N ingrediente(s) con rango de pezzatura amplio — el costo calculado es una
  aproximación."

### Editor de productos
- Campo "Pezzatura" estructurado en `productos/nuevo.tsx`, `productos/editar.tsx`
  y el inline edit del detail `productos/[id].tsx`. Visibilidad dinámica
  según categoría: oculto si no admite, en accordion "Más opciones" si admite
  pero ninguna receta lo usa por unidad, en vista principal si alguna receta
  sí.
- El campo legacy `Product.pezzatura: String?` queda en DB pero ya no se
  expone en ningún form (deprecación gradual).

### Editor de recetas
- **Modal "Estado 3"**: al confirmar (blur) un ingrediente que se cuenta por
  unidad sobre un producto sin pezzatura cargada en categoría que la admite,
  aparece modal "¿Cuánto pesa cada pieza en promedio?" con autoFocus. Si el
  chef toca "Después", se marca skipped en sesión y el modal no se repite.
- **Aviso inline permanente "Falta cargar la pezzatura"**: con el mismo
  trigger que el modal pero queda visible siempre debajo del ingrediente
  (en lugar del modal one-shot). Tocable: navega al detail del producto.
- **Aviso anti-typo** (ya existente desde Fase 4): si el chef carga unit
  piezas sobre un producto cuya categoría NO admite pezzatura (verdura,
  hierba, etc.), texto inline "Este producto se mide por peso, no por
  unidad". Mutuamente excluyente con el de "falta pezzatura".
- **PesoCalculoEditor** debajo de cada ingrediente cuando aplica: "Peso por
  pieza: 58 g (del banco) · Personalizar". Modal con hint explícito sobre
  peso bruto pieza entera. Aviso suave si override está > 2× o < 0.5× del
  rango del banco.

### Banco
- Indicador pasivo "pezzatura pendiente" en cada fila de la lista cuando
  el producto admite pezzatura, alguna receta lo usa por unidad, y aún no
  está cargada. No clickeable: info, no llamado a la acción.
- Chip filtro "Pezzatura pendiente" — sesión de mantenimiento.

### Aviso de desincronización al renombrar
- En `productos/editar.tsx`: si el chef cambia el `name` y el nuevo nombre
  contiene un calibre distinto al cargado, `Alert` "El nombre indica X pero
  la pezzatura cargada es Y. ¿Actualizar pezzatura?" [Actualizar] [Mantener
  actual]. Si el chef tocó manualmente el campo de pezzatura en el form,
  el aviso no dispara (su valor manual gana).

### Migración retroactiva
- Script `migration-pezzatura-fase3.ts` (dry-run + `--apply`). Aplica auto-
  detección sobre los 28 productos existentes (0 detecciones automáticas
  porque ninguno tenía calibre embebido en el nombre) + 2 re-categorizaciones
  manuales aprobadas:
  - Botarga de mujol: `pescado → seco`.
  - Colatura di Alici de Cetara: `pescado → vinagre_aceite`.
- AuditLog persiste cada cambio con razón.

---

## 2. Temas pendientes (fuera de alcance de A.5)

### Confirmados por Andy durante A.5

- **Re-categorizar Botarga y Colatura desde la app si querés ajustar
  `unidadCompra`**. La migración Fase 3 solo cambió `category`. Si querés que
  Colatura tenga `unidadCompra=l` en vez de `kg`, lo hacés desde el editor.
  No es urgente.
- **Cargar precios reales de venta de Gambero Rosso y Ricciola in Bianco**.
  El `€30` del Gambero Rosso es venta de prueba; eso hace que el food cost
  90% sea engañoso. Cuando cargues la venta real, vas a poder validar el
  food cost real del plato. Ricciola in Bianco aún no tiene venta cargada.
- **Cambio masivo de unidad en editor de receta**. Hoy si querés cambiar
  varios ingredientes de "piezas" a "g" tenés que tocar cada rawText
  individualmente. Una operación batch sería útil para refactor rápido.

### Detectados durante validación que NO se arreglaron acá

- **Banco con productos legacy mal categorizados**: Shio-Koji, Mirin, Vinagre
  de Arroz tienen `unidadCompra` incompatible con la receta (la receta los
  pide en `g/ml` y el banco los tiene en `l/ml` distinto). Hacen que
  ingredientes válidos caigan en "no medible". Anotado por Andy para fix
  manual cuando convenga.
- **Productos duplicados creados durante los escenarios E2E**: quedaron en
  el banco "Gamberi 20/30", "Lomo de Ricciola 10/15", "Ricciola 10-15 kg",
  etc. Borrarlos si querés (soft-delete desde el detail).

### Descartados explícitamente

- ~~Matching fuzzy demasiado estricto crea drafts al renombrar~~. Andy
  confirmó que es comportamiento correcto: Gambero Rosso de Mazara, de
  Sicilia y de Garrucha son productos distintos con precios distintos.
  El aviso inline "Falta cargar pezzatura" cubre el síntoma (visibilidad
  del producto nuevo sin calibre).

---

## 3. Estado actual del banco y recetas

### Banco (Dev Kitchen)

```
Total productos activos:    34
Con pezzatura cargada:       6
Sin pezzatura:              28

Por categoría:
  pescado          7         seco             7
  verdura          6         vinagre_aceite   5
  otro             3         fruta            2
  panaderia        1         lacteo           1
  hierba           1         especia          1
```

Los 6 productos con pezzatura estructurada cargada:

```
Gamberi 20/30                              pz_per_kg 15/20
Gamberi Rossi di Mazara                    pz_per_kg 15/20
Gamberi Rossi di Mazara del Vallo          pz_per_kg 20/30
Lomo de Ricciola (Seriola) fresquísima     g_per_piece 4000/6000  (4-6 kg)
Lomo de Ricciola 10/15                     g_per_piece 10000/15000
Ricciola 10-15 kg                          g_per_piece 10000/15000
```

(Los 4 últimos son productos de prueba creados durante los escenarios E2E;
podés soft-deletear los que no quieras conservar.)

### Recetas

```
Total recetas activas:      2
Ingredientes totales:       29
Linked al banco:            29 (100%)
Con pesoCalculoG override:   0
```

| Receta | Porciones | Precio venta |
|---|---|---|
| Gambero Rosso di Mazara, Acqua di Pomodoro Giallo e Sabbia di Pantelleria | 1 | €30,00 (prueba) |
| Ricciola in Bianco: Osmosis di Zucchine e Latte di Mandorla al Garum | 4 | — |

---

## 4. Para retomar contexto más adelante

### Archivos clave

| Capa | Path |
|---|---|
| Schema Prisma | `packages/db/prisma/schema.prisma` (enum `PezzaturaMode`, campos en `Product` y `RecipeIngredient`) |
| Migración SQL | `packages/db/prisma/migrations/20260518100000_add_pezzatura_structured/` |
| Migración retroactiva | `apps/api/scripts/migration-pezzatura-fase3.ts` |
| Parser + helpers shared | `packages/shared/src/pezzatura.ts` (+ tests `.test.ts`) |
| Algoritmo de costeo | `apps/api/lib/products/cost.ts` (+ tests `.test.ts`) |
| Endpoints | `apps/api/app/api/products/{route,from-raw,[id]}.ts` |
| Mobile editor producto | `apps/mobile/app/productos/{nuevo,editar,[id]}.tsx` |
| Mobile editor receta | `apps/mobile/app/recetas/nueva.tsx` |
| Componentes nuevos | `apps/mobile/src/components/{PezzaturaField, PezzaturaPendienteModal, PesoCalculoEditor}.tsx` |
| Schemas Zod | `packages/shared/src/api-contract.ts` |
| Types compartidos | `packages/shared/src/types.ts` |

### Comandos útiles

```bash
# Snapshot del banco + recetas
pnpm exec tsx apps/api/scripts/_a5-cierre-snapshot.ts

# Cost detallado de Gambero Rosso + Ricciola
pnpm exec tsx apps/api/scripts/_checkpoint2-costs.ts

# Re-correr el dry-run de migración (idempotente)
pnpm exec tsx apps/api/scripts/migration-pezzatura-fase3.ts

# Tests del módulo
pnpm --filter shared test pezzatura
pnpm --filter api test cost
```

### AuditLog relevante

Si querés ver qué tocó la migración A.5 en DB:

```sql
SELECT action, "targetId", payload, "createdAt"
FROM "AuditLog"
WHERE action LIKE 'product_recategorized%'
   OR action LIKE 'pezzatura_%'
   OR action LIKE 'recipe_ingredients_relinked'
ORDER BY "createdAt" DESC;
```

### Decisiones arquitectónicas a no olvidar

1. **Override `pesoCalculoG` es peso BRUTO de la pieza entera**, antes de
   pelar/limpiar. Documentado en `cost.ts`, en `PesoCalculoEditor.tsx`,
   en el hint del modal, y en los tests. Si el chef quiere usar peso útil,
   ajusta la merma del producto.
2. **Merma NO se aplica cuando unit es piezas/unidad**. El chef compra
   piezas enteras, la merma física ya está pagada.
3. **Punto medio del rango es el valor canónico** para el cálculo cuando
   no hay override. Si el rango es > 2x, warning suave.
4. **El campo legacy `Product.pezzatura: String?` no se elimina** todavía.
   Conserva texto libre de productos pre-A.5. Deprecación gradual.
5. **Cliente y server usan exactamente el mismo parser** (vive en
   `@atelier/shared`). Eso es por qué la validación inline en el form
   matchea exactamente lo que el server acepta.
