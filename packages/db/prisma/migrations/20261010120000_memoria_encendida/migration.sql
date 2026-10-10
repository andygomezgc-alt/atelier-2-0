-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "city" VARCHAR(80);

-- AlterTable
ALTER TABLE "CulinaryMemory" ALTER COLUMN "enabled" SET DEFAULT true;

-- Restaurantes que nunca guardaron una decisión: memoria encendida (decisión del 10-10-2026).
INSERT INTO "CulinaryMemory" ("restaurantId", "enabled")
SELECT r."id", true FROM "Restaurant" r
WHERE NOT EXISTS (SELECT 1 FROM "CulinaryMemory" m WHERE m."restaurantId" = r."id");
-- El contexto preparado se rehace en el siguiente mensaje, ya con los ingredientes frecuentes (E3).
UPDATE "CulinaryMemory" SET "preparedContext" = NULL, "preparedRevision" = -1, "preparedVersion" = -1;
