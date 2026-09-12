CREATE TABLE "CulinaryMemory" (
 "restaurantId" TEXT PRIMARY KEY REFERENCES "Restaurant"("id") ON DELETE CASCADE,
 "enabled" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 0,
 "learned" JSONB NOT NULL DEFAULT '[]', "corrections" JSONB NOT NULL DEFAULT '[]',
 "excludedKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "inputHash" TEXT,
 "dirtyRevision" INTEGER NOT NULL DEFAULT 0, "checkedRevision" INTEGER NOT NULL DEFAULT -1,
 "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastAttemptAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3), "lockToken" TEXT, "lockExpiresAt" TIMESTAMP(3)
);
CREATE INDEX "CulinaryMemory_enabled_nextCheckAt_idx" ON "CulinaryMemory"("enabled", "nextCheckAt");
CREATE TABLE "CulinaryMemoryRun" (
 "id" TEXT PRIMARY KEY, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
 "provider" TEXT NOT NULL, "model" TEXT NOT NULL, "status" TEXT NOT NULL,
 "inputTokens" INTEGER NOT NULL DEFAULT 0, "outputTokens" INTEGER NOT NULL DEFAULT 0,
 "reasoningTokens" INTEGER NOT NULL DEFAULT 0, "errorCode" TEXT
);
CREATE INDEX "CulinaryMemoryRun_restaurantId_createdAt_idx" ON "CulinaryMemoryRun"("restaurantId", "createdAt");

-- Todos los caminos de escritura (edición, importación, duplicado y borrado).
-- Precios, aprobación de alérgenos y metadatos operativos no disparan aprendizaje.
CREATE FUNCTION culinary_memory_recipe_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE rid TEXT;
BEGIN
 IF TG_OP = 'DELETE' THEN
  IF OLD.state::text NOT IN ('in_test','approved') THEN RETURN NULL; END IF;
  rid := OLD."restaurantId";
 ELSE
  IF TG_OP = 'UPDATE' THEN
   IF NEW.title IS NOT DISTINCT FROM OLD.title
    AND (NEW."contentJson"->'ingredients') IS NOT DISTINCT FROM (OLD."contentJson"->'ingredients')
    AND (NEW."contentJson"->'method') IS NOT DISTINCT FROM (OLD."contentJson"->'method')
    AND NEW.state IS NOT DISTINCT FROM OLD.state AND NEW."deletedAt" IS NOT DISTINCT FROM OLD."deletedAt"
    THEN RETURN NULL; END IF;
   IF OLD.state::text NOT IN ('in_test','approved') AND NEW.state::text NOT IN ('in_test','approved') THEN RETURN NULL; END IF;
  ELSIF NEW.state::text NOT IN ('in_test','approved') THEN RETURN NULL;
  END IF;
  rid := NEW."restaurantId";
 END IF;
 UPDATE "CulinaryMemory" SET "dirtyRevision"="dirtyRevision"+1 WHERE "restaurantId"=rid;
 RETURN NULL;
END $$;
CREATE TRIGGER culinary_memory_recipe_dirty AFTER INSERT OR UPDATE OR DELETE ON "Recipe"
FOR EACH ROW EXECUTE FUNCTION culinary_memory_recipe_dirty();

CREATE FUNCTION culinary_memory_ingredient_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE rec TEXT;
BEGIN
 IF TG_OP = 'DELETE' THEN rec := OLD."recipeId";
 ELSE
  IF TG_OP = 'UPDATE' AND NEW."rawText" IS NOT DISTINCT FROM OLD."rawText"
   AND NEW.qty IS NOT DISTINCT FROM OLD.qty AND NEW.unit IS NOT DISTINCT FROM OLD.unit
   AND NEW.position IS NOT DISTINCT FROM OLD.position THEN RETURN NULL; END IF;
  rec := NEW."recipeId";
 END IF;
 UPDATE "CulinaryMemory" SET "dirtyRevision"="dirtyRevision"+1 WHERE "restaurantId" IN
  (SELECT "restaurantId" FROM "Recipe" WHERE id=rec AND state::text IN ('in_test','approved') AND "deletedAt" IS NULL);
 RETURN NULL;
END $$;
CREATE TRIGGER culinary_memory_ingredient_dirty AFTER INSERT OR UPDATE OR DELETE ON "RecipeIngredient"
FOR EACH ROW EXECUTE FUNCTION culinary_memory_ingredient_dirty();

CREATE FUNCTION culinary_memory_identity_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."identityLine" IS DISTINCT FROM OLD."identityLine" THEN
  UPDATE "CulinaryMemory" SET version=version+1, "dirtyRevision"="dirtyRevision"+1,
   "lockToken"=NULL, "lockExpiresAt"=NULL WHERE "restaurantId"=NEW.id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER culinary_memory_identity_changed AFTER UPDATE OF "identityLine" ON "Restaurant"
FOR EACH ROW EXECUTE FUNCTION culinary_memory_identity_changed();
