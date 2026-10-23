-- A generation closes as settled, released, interrupted or expired (apps/api/lib/ai/budget.ts).
-- The pilot budget migration only allowed 'reserved' and 'settled', so every other close
-- failed on this constraint, rolled back, and left its hold in "AiBudget"."heldMicros".
-- One statement, so the table is never left without the constraint.
ALTER TABLE "AiGeneration" DROP CONSTRAINT "AiGeneration_valid", ADD CONSTRAINT "AiGeneration_valid" CHECK (
  "reservedMicros" > 0 AND ("chargedMicros" IS NULL OR "chargedMicros" >= 0) AND "inputCeiling" > 0 AND "outputCeiling" > 0
  AND "status" IN ('reserved', 'settled', 'released', 'interrupted', 'expired')
);
