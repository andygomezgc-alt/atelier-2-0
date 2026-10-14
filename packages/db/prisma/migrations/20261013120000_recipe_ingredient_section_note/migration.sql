-- RecipeIngredient.section / note: the standard ingredient format keeps the
-- preparation a line belongs to ("Farsa") and its kitchen note ("muy frío")
-- apart from rawText. Additive only: two nullable columns; existing rows stay
-- NULL (no section, no note).

-- AlterTable
ALTER TABLE "RecipeIngredient" ADD COLUMN     "note" VARCHAR(300),
ADD COLUMN     "section" VARCHAR(80);

