-- Entrega A.5 — Pezzatura estructurada.
-- Aditivo: 1 enum nuevo + 3 columnas nullable en Product + 1 columna nullable
-- en RecipeIngredient. Sin pérdida de datos.
--
-- Los campos legacy `Product.pezzatura` y `RecipeIngredient.pezzatura` (texto
-- libre) se mantienen intactos; conviven con los structured hasta Fase 3
-- (migración retroactiva que parsea legacy + nombre y rellena los nuevos).
--
-- CHECK constraints:
--  - Product_pezzatura_consistency: los 3 campos (Mode, Min, Max) van juntos.
--    Todos null o todos no-null. Sin esto se pueden meter filas con Mode set
--    sin Min/Max y romper el algoritmo de costeo.
--  - Product_pezzaturaMin: no negativo (ni pz/kg ni g/pz admiten negativos).
--  - Product_pezzaturaMax: >= Min (valor único es Min==Max, no Min>Max).
--  - RecipeIngredient_pesoCalculoG_check: override > 0 si está set.

-- CreateEnum
CREATE TYPE "PezzaturaMode" AS ENUM ('pz_per_kg', 'g_per_piece');

-- AlterTable Product: agregar pezzaturaMode/Min/Max (los tres nullable).
ALTER TABLE "Product" ADD COLUMN "pezzaturaMode" "PezzaturaMode";
ALTER TABLE "Product" ADD COLUMN "pezzaturaMin" DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN "pezzaturaMax" DECIMAL(10,2);

-- CHECKs en Product. En Postgres una CHECK pasa si el resultado es TRUE o
-- NULL, así que las filas existentes (con los 3 campos NULL) no se rechazan.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_pezzatura_consistency_check" CHECK (
    ("pezzaturaMode" IS NULL AND "pezzaturaMin" IS NULL AND "pezzaturaMax" IS NULL)
    OR
    ("pezzaturaMode" IS NOT NULL AND "pezzaturaMin" IS NOT NULL AND "pezzaturaMax" IS NOT NULL)
  );
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_pezzaturaMin_check" CHECK ("pezzaturaMin" IS NULL OR "pezzaturaMin" >= 0);
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_pezzaturaMax_check" CHECK ("pezzaturaMax" IS NULL OR "pezzaturaMax" >= "pezzaturaMin");

-- AlterTable RecipeIngredient: override de peso por pieza (gramos).
-- Solo aplica cuando unit = "piezas" y el chef quiere usar un peso distinto
-- al rango del banco. Null = usar el punto medio de pezzaturaMin/Max del
-- producto.
ALTER TABLE "RecipeIngredient" ADD COLUMN "pesoCalculoG" DECIMAL(10,3);

ALTER TABLE "RecipeIngredient"
  ADD CONSTRAINT "RecipeIngredient_pesoCalculoG_check" CHECK ("pesoCalculoG" IS NULL OR "pesoCalculoG" > 0);
