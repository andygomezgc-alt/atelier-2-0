-- AlterTable
ALTER TABLE "CulinaryMemory" ADD COLUMN     "importPendingAt" TIMESTAMP(3),
ADD COLUMN     "importTicket" INTEGER NOT NULL DEFAULT 0;
