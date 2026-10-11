-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "cacheWriteTokens" INTEGER,
ADD COLUMN     "generationId" TEXT;

-- CreateIndex
CREATE INDEX "Message_generationId_idx" ON "Message"("generationId");

