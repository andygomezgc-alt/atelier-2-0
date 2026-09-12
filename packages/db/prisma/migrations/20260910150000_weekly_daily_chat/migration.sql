BEGIN;

ALTER TABLE "AiChatQuota"
  ADD COLUMN "dailyAt" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[];

-- Preserve admitted Daily generations from the previous daily quota. The
-- generation ledger records both settled and still-reserved requests.
UPDATE "AiChatQuota" AS quota
SET "dailyAt" = ARRAY(
  SELECT generation."createdAt"
  FROM "AiGeneration" AS generation
  WHERE generation."userId" = quota."userId"
    AND generation."task" = 'daily'
    AND generation."createdAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '7 days'
  ORDER BY generation."createdAt"
);

COMMIT;
