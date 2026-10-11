-- AlterTable
ALTER TABLE "CulinaryMemory" ADD COLUMN     "discardStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFailedAt" TIMESTAMP(3);
