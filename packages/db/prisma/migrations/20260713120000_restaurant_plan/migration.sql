-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('pilot', 'founder', 'early', 'pro');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('trial', 'active', 'past_due', 'canceled');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "graceUntil" TIMESTAMP(3),
ADD COLUMN     "plan" "PlanTier" NOT NULL DEFAULT 'pilot',
ADD COLUMN     "planStatus" "PlanStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_stripeCustomerId_key" ON "Restaurant"("stripeCustomerId");
