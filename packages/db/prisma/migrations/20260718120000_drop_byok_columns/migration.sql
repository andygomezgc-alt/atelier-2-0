-- Fin de la feature BYOK ("Tu API key"): el chat/extracción siempre usan la
-- clave del server con cuota. Irreversible: los ciphertexts guardados se pierden.
ALTER TABLE "User" DROP COLUMN "customProvider";
ALTER TABLE "User" DROP COLUMN "customApiKey";
ALTER TABLE "User" DROP COLUMN "customModel";
