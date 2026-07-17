-- P2-6 (auditoría jul 2026) — idempotencia del webhook de Stripe por event.id.
-- Un evento reentregado (o fuera de orden) ya no se reprocesa: el handler
-- intenta insertar el id y, si choca (P2002 = ya visto), corta sin tocar
-- planStatus.

-- CreateTable
CREATE TABLE "ProcessedStripeEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);
