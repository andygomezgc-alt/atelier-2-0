-- Rollback de 20260518100000_add_pezzatura_structured
--
-- Aplicar con:  psql "$DATABASE_URL" -f rollback.sql
--
-- ATENCIÓN: si hay productos con pezzaturaMode/Min/Max cargados, o
-- ingredientes con pesoCalculoG, esos valores se pierden. Antes de correr,
-- pg_dump al menos las dos tablas si hay datos en los campos nuevos.
--
-- Orden:
--   1. Drop CHECK constraints (no estrictamente necesario antes de drop
--      columns, pero claro de leer).
--   2. Drop columnas nuevas.
--   3. Drop enum al final, cuando ya ninguna columna lo referencie.

BEGIN;

-- 1. CHECK constraints
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_pezzatura_consistency_check";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_pezzaturaMin_check";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_pezzaturaMax_check";
ALTER TABLE "RecipeIngredient" DROP CONSTRAINT IF EXISTS "RecipeIngredient_pesoCalculoG_check";

-- 2. Columnas nuevas
ALTER TABLE "Product" DROP COLUMN IF EXISTS "pezzaturaMax";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "pezzaturaMin";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "pezzaturaMode";
ALTER TABLE "RecipeIngredient" DROP COLUMN IF EXISTS "pesoCalculoG";

-- 3. Enum
DROP TYPE IF EXISTS "PezzaturaMode";

COMMIT;
