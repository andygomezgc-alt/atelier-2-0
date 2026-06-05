-- Bloque "alérgenos" — Reg. EU 1169/2011 Anexo II.
-- Aditivo: 1 enum nuevo + 1 columna nullable en Product + 1 columna array
-- con default '{}' en Recipe + 1 columna boolean con default true en MenuFolder.
-- Sin pérdida de datos. No toca RecipeIngredient (la unión se calcula al vuelo).
--
-- Decisiones cerradas con Andy:
--  * 1 alérgeno por producto (no array). Aceite = null. Mantequilla = milk.
--  * Recipe.manualAllergens es el set de alérgenos añadidos a mano por chef
--    desde la preview del menú. Aditivos globales (heredados a todo menú).
--  * MenuFolder.showAllergensInPdf es toggle binario: ON muestra todos en
--    el PDF cliente, OFF ninguno. Sin granularidad por alérgeno.
--  * No hay tabla de overrides para ocultar alérgenos puntuales — el plan
--    original lo contemplaba y se descartó por riesgo legal.

-- CreateEnum
CREATE TYPE "Allergen" AS ENUM (
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'tree_nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs'
);

-- AlterTable Product: 1 alérgeno opcional por producto.
ALTER TABLE "Product" ADD COLUMN "allergen" "Allergen";

-- AlterTable Recipe: alérgenos manuales aditivos globales (vacío por default).
ALTER TABLE "Recipe" ADD COLUMN "manualAllergens" "Allergen"[] NOT NULL DEFAULT '{}';

-- AlterTable MenuFolder: toggle global del PDF cliente (encendido por default
-- para que la transparencia con el cliente sea la posición por defecto).
ALTER TABLE "MenuFolder" ADD COLUMN "showAllergensInPdf" BOOLEAN NOT NULL DEFAULT true;
