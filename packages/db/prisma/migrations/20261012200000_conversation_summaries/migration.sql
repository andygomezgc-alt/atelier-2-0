-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "summaryFailedThrough" INTEGER,
ADD COLUMN     "summaryFailures" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ConversationSummary" (
    "conversationId" TEXT NOT NULL,
    "through" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("conversationId","through")
);

-- AddForeignKey
ALTER TABLE "ConversationSummary" ADD CONSTRAINT "ConversationSummary_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

