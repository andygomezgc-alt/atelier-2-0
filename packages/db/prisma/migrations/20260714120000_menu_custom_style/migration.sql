-- "Tu estilo" — 4ª plantilla de menú (custom, de la casa).
-- Seguro en una sola migración: ADD VALUE + ADD COLUMN sin usar 'custom'
-- en ningún INSERT/UPDATE dentro de esta transacción.

-- AlterEnum
ALTER TYPE "MenuStyle" ADD VALUE 'custom';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "menuStyleRefUrl" TEXT,
ADD COLUMN     "menuStyleSpec" JSONB;
