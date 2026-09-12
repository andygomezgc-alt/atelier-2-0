CREATE TABLE "IdeaCreateReceipt" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "clientRequestId" VARCHAR(100) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "ideaId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdeaCreateReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IdeaCreateReceipt_ideaId_key" ON "IdeaCreateReceipt"("ideaId");
CREATE UNIQUE INDEX "IdeaCreateReceipt_restaurantId_authorId_clientRequestId_key" ON "IdeaCreateReceipt"("restaurantId", "authorId", "clientRequestId");
CREATE INDEX "IdeaCreateReceipt_authorId_idx" ON "IdeaCreateReceipt"("authorId");
ALTER TABLE "IdeaCreateReceipt" ADD CONSTRAINT "IdeaCreateReceipt_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaCreateReceipt" ADD CONSTRAINT "IdeaCreateReceipt_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaCreateReceipt" ADD CONSTRAINT "IdeaCreateReceipt_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
