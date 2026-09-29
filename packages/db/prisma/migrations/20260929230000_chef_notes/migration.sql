-- CreateTable
CREATE TABLE "ChefNote" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "text" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChefNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChefNote_restaurantId_createdAt_idx" ON "ChefNote"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChefNote" ADD CONSTRAINT "ChefNote_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
