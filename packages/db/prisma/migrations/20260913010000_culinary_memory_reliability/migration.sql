-- Additive fields keep the previous API server deployable while the new code
-- starts preparing deterministic chat context and a single retry per cycle.
ALTER TABLE "CulinaryMemory"
  ADD COLUMN "preparedContext" TEXT,
  ADD COLUMN "preparedRevision" INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN "preparedVersion" INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN "cycleStartedAt" TIMESTAMP(3),
  ADD COLUMN "retryAt" TIMESTAMP(3);

UPDATE "CulinaryMemory"
SET "cycleStartedAt" = "lastAttemptAt"
WHERE "lastAttemptAt" IS NOT NULL;

ALTER TABLE "CulinaryMemoryRun"
  ADD COLUMN "cycleStartedAt" TIMESTAMP(3),
  ADD COLUMN "isRetry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedTrends" JSONB;

CREATE INDEX "CulinaryMemoryRun_createdAt_idx" ON "CulinaryMemoryRun"("createdAt");

-- Only changes that can alter culinary evidence invalidate the prepared
-- context. A rename and in_test <-> approved keep the same verified source.
CREATE OR REPLACE FUNCTION culinary_memory_recipe_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  rids TEXT[];
  old_eligible BOOLEAN;
  new_eligible BOOLEAN;
  culinary_changed BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_eligible := OLD.state::text IN ('in_test','approved') AND OLD."deletedAt" IS NULL;
    IF NOT old_eligible THEN RETURN NULL; END IF;
    rids := ARRAY[OLD."restaurantId"];
  ELSIF TG_OP = 'INSERT' THEN
    new_eligible := NEW.state::text IN ('in_test','approved') AND NEW."deletedAt" IS NULL;
    IF NOT new_eligible THEN RETURN NULL; END IF;
    rids := ARRAY[NEW."restaurantId"];
  ELSE
    old_eligible := OLD.state::text IN ('in_test','approved') AND OLD."deletedAt" IS NULL;
    new_eligible := NEW.state::text IN ('in_test','approved') AND NEW."deletedAt" IS NULL;
    culinary_changed := (NEW."contentJson"->'ingredients') IS DISTINCT FROM (OLD."contentJson"->'ingredients')
      OR (NEW."contentJson"->'method') IS DISTINCT FROM (OLD."contentJson"->'method');
    IF NEW."restaurantId" IS NOT DISTINCT FROM OLD."restaurantId"
      AND old_eligible = new_eligible
      AND NOT (culinary_changed AND (old_eligible OR new_eligible)) THEN RETURN NULL; END IF;
    IF NOT old_eligible AND NOT new_eligible THEN RETURN NULL; END IF;
    rids := ARRAY[OLD."restaurantId", NEW."restaurantId"];
  END IF;
  UPDATE "CulinaryMemory"
  SET "dirtyRevision" = "dirtyRevision" + 1, "preparedContext" = NULL
  WHERE "restaurantId" = ANY(rids);
  RETURN NULL;
END $$;

-- Structured ingredient evidence uses rawText in position order. Quantity,
-- unit and costing metadata do not change the memory fingerprint.
CREATE OR REPLACE FUNCTION culinary_memory_ingredient_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  recs TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    recs := ARRAY[NEW."recipeId"];
  ELSIF TG_OP = 'DELETE' THEN
    recs := ARRAY[OLD."recipeId"];
  ELSE
    IF NEW."recipeId" IS NOT DISTINCT FROM OLD."recipeId"
      AND NEW."rawText" IS NOT DISTINCT FROM OLD."rawText"
      AND NEW.position IS NOT DISTINCT FROM OLD.position THEN RETURN NULL; END IF;
    recs := ARRAY[OLD."recipeId", NEW."recipeId"];
  END IF;
  UPDATE "CulinaryMemory"
  SET "dirtyRevision" = "dirtyRevision" + 1, "preparedContext" = NULL
  WHERE "restaurantId" IN (
    SELECT DISTINCT "restaurantId" FROM "Recipe"
    WHERE id = ANY(recs) AND state::text IN ('in_test','approved') AND "deletedAt" IS NULL
  );
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION culinary_memory_identity_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."identityLine" IS DISTINCT FROM OLD."identityLine" THEN
    UPDATE "CulinaryMemory" SET version=version+1, "dirtyRevision"="dirtyRevision"+1,
      "preparedContext"=NULL, "lockToken"=NULL, "lockExpiresAt"=NULL
    WHERE "restaurantId"=NEW.id;
  END IF;
  RETURN NULL;
END $$;
