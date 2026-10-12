-- Product.gramosPorLitro: weight in grams of 1 litre of the product, so the
-- cost engine can convert g/kg <-> l/ml. Additive only: one nullable column
-- (null = unknown, never guessed) and a CHECK that rejects zero or negative
-- values. Existing rows stay NULL, which the CHECK accepts.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gramosPorLitro" DECIMAL(7,2);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_gramosPorLitro_positive" CHECK ("gramosPorLitro" IS NULL OR "gramosPorLitro" > 0);
