ALTER TABLE "Conversation" ADD COLUMN "generationId" TEXT, ADD COLUMN "generationStartedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "responseToId" TEXT, ADD COLUMN "modelId" TEXT;
CREATE UNIQUE INDEX "Message_responseToId_key" ON "Message"("responseToId");
ALTER TABLE "Recipe" ADD COLUMN "clientRequestId" TEXT, ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "Recipe_restaurantId_authorId_clientRequestId_key" ON "Recipe"("restaurantId", "authorId", "clientRequestId");
