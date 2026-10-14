-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('reading', 'review', 'applied', 'failed');

-- CreateEnum
CREATE TYPE "InvoiceLineAction" AS ENUM ('update_price', 'create_draft', 'connect', 'ignore');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "taxRatePct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductPriceHistory" ADD COLUMN     "invoiceLineId" TEXT;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "taxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "number" TEXT,
    "issuedOn" DATE,
    "netTotalCents" INTEGER,
    "taxTotalCents" INTEGER,
    "grossTotalCents" INTEGER,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'reading',
    "failureReason" TEXT,
    "uploadedById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePage" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,

    CONSTRAINT "InvoicePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "code" TEXT,
    "quantity" DECIMAL(12,3),
    "unit" TEXT,
    "packQty" DECIMAL(12,3),
    "packUnit" TEXT,
    "unitPriceCents" INTEGER,
    "taxRatePct" DECIMAL(5,2),
    "lineTotalCents" INTEGER,
    "productId" TEXT,
    "matchLevel" TEXT,
    "action" "InvoiceLineAction",
    "appliedPriceCents" INTEGER,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierItem" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "code" TEXT,
    "descriptionNorm" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "packQty" DECIMAL(12,3),
    "packUnit" TEXT,
    "lastPriceCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_restaurantId_nameNorm_key" ON "Supplier"("restaurantId", "nameNorm");

-- CreateIndex
CREATE INDEX "Invoice_restaurantId_deletedAt_issuedOn_idx" ON "Invoice"("restaurantId", "deletedAt", "issuedOn");

-- CreateIndex
CREATE INDEX "Invoice_restaurantId_status_idx" ON "Invoice"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Invoice_supplierId_number_idx" ON "Invoice"("supplierId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePage_invoiceId_position_key" ON "InvoicePage"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "InvoiceLine_productId_idx" ON "InvoiceLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_position_key" ON "InvoiceLine"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "SupplierItem_productId_idx" ON "SupplierItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierItem_supplierId_descriptionNorm_key" ON "SupplierItem"("supplierId", "descriptionNorm");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierItem_supplierId_code_key" ON "SupplierItem"("supplierId", "code");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_invoiceLineId_idx" ON "ProductPriceHistory"("invoiceLineId");

-- AddForeignKey
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePage" ADD CONSTRAINT "InvoicePage_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Product"
  ADD CONSTRAINT "Product_taxRatePct_range" CHECK ("taxRatePct" >= 0 AND "taxRatePct" <= 100);

ALTER TABLE "InvoiceLine"
  ADD CONSTRAINT "InvoiceLine_taxRatePct_range" CHECK ("taxRatePct" IS NULL OR ("taxRatePct" >= 0 AND "taxRatePct" <= 100));
