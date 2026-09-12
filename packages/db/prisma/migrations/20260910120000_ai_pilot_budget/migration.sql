CREATE TABLE "AiBudget" (
  "id" TEXT PRIMARY KEY, "limitMicros" INTEGER NOT NULL,
  "spentMicros" INTEGER NOT NULL DEFAULT 0, "heldMicros" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "warnedAt" TIMESTAMP(3), "blockedAt" TIMESTAMP(3),
  CONSTRAINT "AiBudget_nonnegative" CHECK ("limitMicros" > 0 AND "spentMicros" >= 0 AND "heldMicros" >= 0),
  CONSTRAINT "AiBudget_period" CHECK ("endsAt" > "startsAt")
);
CREATE TABLE "AiGeneration" (
  "id" TEXT PRIMARY KEY, "budgetId" TEXT NOT NULL, "userId" TEXT,
  "task" TEXT NOT NULL, "model" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'reserved',
  "reservedMicros" INTEGER NOT NULL, "chargedMicros" INTEGER,
  "inputCeiling" INTEGER NOT NULL, "outputCeiling" INTEGER NOT NULL,
  "inputTokens" INTEGER, "outputTokens" INTEGER, "cachedTokens" INTEGER, "cacheWriteTokens" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
  CONSTRAINT "AiGeneration_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "AiBudget"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiGeneration_valid" CHECK ("reservedMicros" > 0 AND ("chargedMicros" IS NULL OR "chargedMicros" >= 0) AND "inputCeiling" > 0 AND "outputCeiling" > 0 AND "status" IN ('reserved', 'settled'))
);
CREATE INDEX "AiGeneration_budgetId_status_idx" ON "AiGeneration"("budgetId", "status");
CREATE INDEX "AiGeneration_userId_idx" ON "AiGeneration"("userId");
CREATE TABLE "AiChatQuota" (
  "userId" TEXT PRIMARY KEY, "day" TEXT NOT NULL, "dailyCount" INTEGER NOT NULL DEFAULT 0,
  "creativeAt" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[],
  CONSTRAINT "AiChatQuota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiChatQuota_dailyCount_check" CHECK ("dailyCount" >= 0)
);
