-- Bloque 5 · Estado "en servicio" por menú. Booleano independiente: varios
-- menús pueden estar en servicio a la vez (carta fija + degustación + …).
-- Default false: TODOS los menús existentes arrancan apagados. El chef los
-- enciende manualmente desde el header del menú.
--
-- Dry-run confirmado por Andy (2026-05-22): ningún campo existente se altera,
-- ningún registro se borra, ninguna otra tabla se toca. Solo se agrega la
-- columna y se backfileea con `false` para los 6 menús existentes en la DB.

ALTER TABLE "MenuFolder" ADD COLUMN "inService" BOOLEAN NOT NULL DEFAULT false;

-- Índice para acelerar el filtro de la lista (WHERE restaurantId=? AND inService=true).
CREATE INDEX "MenuFolder_restaurantId_inService_idx" ON "MenuFolder"("restaurantId", "inService");
