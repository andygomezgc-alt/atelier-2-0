ALTER TABLE "MenuItem" ADD COLUMN "priceUnit" TEXT NOT NULL DEFAULT 'portion';
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_priceUnit_check" CHECK ("priceUnit" IN ('portion', 'kg'));
ALTER TABLE "MenuFolder" ADD COLUMN "serviceCharges" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Restaurant" ADD COLUMN "menuStyleVersionId" TEXT;
CREATE TABLE "MenuStyleVersion" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "spec" JSONB NOT NULL,
  "theme" JSONB,
  "refUrl" TEXT,
  "sourceHash" TEXT,
  "mimeType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  "discardedAt" TIMESTAMP(3),
  CONSTRAINT "MenuStyleVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MenuStyleVersion_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MenuStyleVersion_restaurantId_createdAt_idx" ON "MenuStyleVersion"("restaurantId", "createdAt");
CREATE INDEX "MenuStyleVersion_restaurantId_sourceHash_idx" ON "MenuStyleVersion"("restaurantId", "sourceHash");
