-- Rollback de 20260514000000_banco_productos
--
-- Aplicar con:  psql "$DATABASE_URL" -f rollback.sql
--
-- ATENCIÓN: este script ELIMINA datos. Si ya cargaste productos, yield tests
-- o histórico de precios, todo se pierde. Antes de correrlo, hacé pg_dump
-- al menos de las 4 tablas nuevas. Las columnas portions y salePrice de
-- Recipe también se pierden — si tenés recetas con esos valores, hacé un
-- dump de Recipe también.
--
-- Orden:
--   1. Drop tablas dependientes primero (no estrictamente necesario por
--      CASCADE, pero claro de leer).
--   2. Drop columnas de Recipe.
--   3. Drop enums (al final, después que ninguna columna los referencie).

BEGIN;

-- 1. Tablas nuevas
DROP TABLE IF EXISTS "ProductPriceHistory";
DROP TABLE IF EXISTS "YieldTest";
DROP TABLE IF EXISTS "RecipeIngredient";
DROP TABLE IF EXISTS "Product";

-- 2. Columnas agregadas a Recipe
ALTER TABLE "Recipe" DROP COLUMN IF EXISTS "salePrice";
ALTER TABLE "Recipe" DROP COLUMN IF EXISTS "portions";

-- 3. Enums (en orden inverso al CREATE para facilitar code review)
DROP TYPE IF EXISTS "Criticality";
DROP TYPE IF EXISTS "MermaOrigin";
DROP TYPE IF EXISTS "ProductState";
DROP TYPE IF EXISTS "ProductUnit";
DROP TYPE IF EXISTS "ProductCategory";

-- 4. Borrar el registro de migración aplicada (si fue aplicada via prisma)
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260514000000_banco_productos';

COMMIT;
