-- Banco de Productos — Fase 0 (cimientos).
-- Agrega 4 tablas nuevas (Product, RecipeIngredient, YieldTest,
-- ProductPriceHistory), 5 enums, y 2 columnas opcionales a Recipe
-- (portions, salePrice). Todo aditivo: no toca datos existentes.
--
-- rawText en RecipeIngredient se preserva SIEMPRE (audit trail del texto
-- original que entró por chef/asistente/upload).
--
-- Costo real NO se persiste — se calcula en read time como
-- precioCompra / (1 - mermaPct/100).

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('pescado', 'carne', 'verdura', 'fruta', 'lacteo', 'panaderia', 'seco', 'especia', 'hierba', 'vinagre_aceite', 'otro');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('kg', 'g', 'l', 'ml', 'unidad', 'caja');

-- CreateEnum
CREATE TYPE "ProductState" AS ENUM ('activo', 'borrador', 'archivado');

-- CreateEnum
CREATE TYPE "MermaOrigin" AS ENUM ('sugerida', 'confirmada', 'medida');

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('alta', 'media', 'baja');

-- AlterTable Recipe: agregar portions + salePrice (ambos opcionales).
-- CHECKs como cinturón al Zod: portions positivo si está set, salePrice no
-- negativo. En Postgres una CHECK pasa si el resultado es TRUE o NULL, así
-- que las filas existentes con valor NULL no se rechazan.
ALTER TABLE "Recipe" ADD COLUMN "portions" INTEGER CHECK ("portions" > 0);
ALTER TABLE "Recipe" ADD COLUMN "salePrice" INTEGER CHECK ("salePrice" >= 0);

-- CreateTable Product
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "pezzatura" TEXT,
    "unidadCompra" "ProductUnit" NOT NULL,
    "precioCompra" INTEGER NOT NULL,
    "mermaPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "mermaOrigen" "MermaOrigin" NOT NULL DEFAULT 'sugerida',
    "proveedor" TEXT,
    "precioActualizadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,
    "estado" "ProductState" NOT NULL DEFAULT 'activo',
    "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "criticality" "Criticality" NOT NULL,
    "criticalityManual" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
    -- Cinturón de seguridad: precio no negativo, merma entre 0 y 100.
    CONSTRAINT "Product_precioCompra_check" CHECK ("precioCompra" >= 0),
    CONSTRAINT "Product_mermaPct_check" CHECK ("mermaPct" >= 0 AND "mermaPct" <= 100)
);

-- CreateIndex
CREATE INDEX "Product_restaurantId_estado_idx" ON "Product"("restaurantId", "estado");
CREATE INDEX "Product_restaurantId_criticality_idx" ON "Product"("restaurantId", "criticality");
CREATE INDEX "Product_restaurantId_deletedAt_idx" ON "Product"("restaurantId", "deletedAt");
CREATE INDEX "Product_restaurantId_name_idx" ON "Product"("restaurantId", "name");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable RecipeIngredient
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "productId" TEXT,
    "position" INTEGER NOT NULL,
    "rawText" TEXT NOT NULL,
    "qty" DECIMAL(10,3),
    "unit" TEXT,
    "pezzatura" TEXT,
    "mermaOverridePct" DECIMAL(5,2),

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id"),
    -- position no negativo; qty y merma override pasan si NULL, si están set
    -- se validan. rawText siempre NOT NULL — audit trail.
    CONSTRAINT "RecipeIngredient_position_check" CHECK ("position" >= 0),
    CONSTRAINT "RecipeIngredient_qty_check" CHECK ("qty" IS NULL OR "qty" >= 0),
    CONSTRAINT "RecipeIngredient_merma_check" CHECK ("mermaOverridePct" IS NULL OR ("mermaOverridePct" >= 0 AND "mermaOverridePct" <= 100))
);

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_position_idx" ON "RecipeIngredient"("recipeId", "position");
CREATE INDEX "RecipeIngredient_productId_idx" ON "RecipeIngredient"("productId");

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable YieldTest
CREATE TABLE "YieldTest" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "pesoBrutoG" DECIMAL(10,3) NOT NULL,
    "pesoUtilG" DECIMAL(10,3) NOT NULL,
    "mermaCalculadaPct" DECIMAL(5,2) NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YieldTest_pkey" PRIMARY KEY ("id"),
    -- Pesos positivos, peso útil no puede ser mayor al bruto (yield <= 1),
    -- merma calculada entre 0-100.
    CONSTRAINT "YieldTest_pesoBruto_check" CHECK ("pesoBrutoG" > 0),
    CONSTRAINT "YieldTest_pesoUtil_check" CHECK ("pesoUtilG" >= 0 AND "pesoUtilG" <= "pesoBrutoG"),
    CONSTRAINT "YieldTest_merma_check" CHECK ("mermaCalculadaPct" >= 0 AND "mermaCalculadaPct" <= 100)
);

-- CreateIndex
CREATE INDEX "YieldTest_productId_createdAt_idx" ON "YieldTest"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "YieldTest" ADD CONSTRAINT "YieldTest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "YieldTest" ADD CONSTRAINT "YieldTest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "YieldTest" ADD CONSTRAINT "YieldTest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable ProductPriceHistory
CREATE TABLE "ProductPriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "authorId" TEXT,
    "precio" INTEGER NOT NULL,
    "unidadCompra" "ProductUnit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductPriceHistory_precio_check" CHECK ("precio" >= 0)
);

-- CreateIndex
CREATE INDEX "ProductPriceHistory_productId_createdAt_idx" ON "ProductPriceHistory"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
