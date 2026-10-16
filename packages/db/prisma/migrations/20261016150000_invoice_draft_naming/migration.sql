-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "mermaMotivo" TEXT;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "draftCategory" "ProductCategory",
ADD COLUMN     "draftMermaPct" DECIMAL(5,2),
ADD COLUMN     "draftMermaReason" TEXT,
ADD COLUMN     "draftName" TEXT;

ALTER TABLE "InvoiceLine"
  ADD CONSTRAINT "InvoiceLine_draftMermaPct_range" CHECK ("draftMermaPct" IS NULL OR ("draftMermaPct" >= 0 AND "draftMermaPct" <= 100));
