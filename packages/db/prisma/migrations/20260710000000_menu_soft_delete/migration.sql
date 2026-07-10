-- AlterTable
ALTER TABLE "MenuFolder" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MenuFolder_restaurantId_deletedAt_idx" ON "MenuFolder"("restaurantId", "deletedAt");
