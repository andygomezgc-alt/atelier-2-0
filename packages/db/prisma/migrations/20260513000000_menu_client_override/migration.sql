-- Mejora 3: capa de overrides "solo PDF cliente" por menú.
-- Tabla aislada (1:1 con MenuFolder) para que las modificaciones que hace el
-- chef antes de exportar la carta del cliente NO toquen ni la receta original
-- ni el `customName/customDesc/price` que ve el staff.
--
-- Aditivo: ningún cambio destructivo. JSONB con shape libre validado vía Zod
-- en la capa app. Borrar un menú arrastra su override (ON DELETE CASCADE).

-- CreateTable
CREATE TABLE "MenuClientOverride" (
    "id" TEXT NOT NULL,
    "menuFolderId" TEXT NOT NULL,
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuClientOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (UNIQUE 1:1 con MenuFolder)
CREATE UNIQUE INDEX "MenuClientOverride_menuFolderId_key" ON "MenuClientOverride"("menuFolderId");

-- AddForeignKey
ALTER TABLE "MenuClientOverride" ADD CONSTRAINT "MenuClientOverride_menuFolderId_fkey" FOREIGN KEY ("menuFolderId") REFERENCES "MenuFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
