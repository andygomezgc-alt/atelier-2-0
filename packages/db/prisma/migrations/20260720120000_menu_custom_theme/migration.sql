-- "Tu estilo" fiel — theme HTML/CSS completo generado por IA de la carta real.
-- Dato NUEVO adicional al menuStyleSpec (que se conserva para la preview móvil).
-- Columna nullable, sin default: los restaurantes existentes quedan en NULL.

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "menuStyleTheme" JSONB;
