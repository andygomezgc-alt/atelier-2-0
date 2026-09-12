ALTER TABLE "Product"
  ADD COLUMN "allergens" "Allergen"[] NOT NULL DEFAULT ARRAY[]::"Allergen"[],
  ADD COLUMN "allergensReviewed" BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing hints, but do not turn automatic name detection into a review.
UPDATE "Product" SET "allergens" = ARRAY["allergen"] WHERE "allergen" IS NOT NULL;
