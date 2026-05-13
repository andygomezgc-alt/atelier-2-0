-- Mejora 3: secciones dentro de cada menú (carta).
-- Nueva tabla MenuSection + columna MenuItem.sectionId (nullable).
-- Data-migration: para cada MenuFolder que ya tiene items, creamos una sección
-- por defecto llamada "Recetas" (matchea el label actual) y reasignamos todos
-- sus items a esa sección. Sin pérdida de datos.
--
-- sectionId queda nullable a propósito: si el usuario borra una sección, sus
-- items quedan "sueltos" (SET NULL) y la app los muestra como sin sección, en
-- vez de borrarlos en cascada.

-- CreateTable
CREATE TABLE "MenuSection" (
    "id" TEXT NOT NULL,
    "menuFolderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuSection_menuFolderId_order_idx" ON "MenuSection"("menuFolderId", "order");

-- AddForeignKey
ALTER TABLE "MenuSection" ADD CONSTRAINT "MenuSection_menuFolderId_fkey" FOREIGN KEY ("menuFolderId") REFERENCES "MenuFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "sectionId" TEXT;

-- CreateIndex
CREATE INDEX "MenuItem_sectionId_order_idx" ON "MenuItem"("sectionId", "order");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "MenuSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────── Data migration ────────────
-- For every MenuFolder that has at least one item, create a default section
-- named "Recetas" and rewire all its items to it. Menus without items get
-- nothing (they'll start sectionless and the user creates sections as needed).

WITH menus_with_items AS (
  SELECT DISTINCT "menuFolderId" FROM "MenuItem"
), new_sections AS (
  INSERT INTO "MenuSection" ("id", "menuFolderId", "name", "order", "createdAt")
  SELECT
    gen_random_uuid()::text,
    "menuFolderId",
    'Recetas',
    0,
    NOW()
  FROM menus_with_items
  RETURNING "id", "menuFolderId"
)
UPDATE "MenuItem" mi
SET "sectionId" = ns."id"
FROM new_sections ns
WHERE mi."menuFolderId" = ns."menuFolderId";
