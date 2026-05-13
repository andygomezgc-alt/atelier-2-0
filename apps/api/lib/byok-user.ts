// Lee la config BYOK del usuario, devuelve la clave ya descifrada lista
// para usar contra Anthropic/OpenAI/Google. Self-heals legacy plaintext:
// si la fila quedó de antes de la encripción, la usa y la re-guarda
// cifrada en background.

import { prisma } from "@atelier/db";
import { encrypt, decrypt, isEncrypted } from "./crypto";
import { logger } from "./logger";

export type LoadedBYOK = {
  provider: "anthropic" | "openai" | "google";
  apiKey: string; // plaintext, listo para usar
  model: string;
};

export async function loadUserBYOK(userId: string): Promise<LoadedBYOK | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { customProvider: true, customApiKey: true, customModel: true },
  });
  if (!user?.customProvider || !user?.customApiKey || !user?.customModel) {
    return null;
  }

  let plaintext: string;
  let needsReencrypt = false;

  if (isEncrypted(user.customApiKey)) {
    try {
      plaintext = decrypt(user.customApiKey);
    } catch (err) {
      logger.error("byok_decrypt_failed", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
      // Ciphertext corrupto — tratamos al usuario como si no tuviera BYOK.
      // No revelamos el error al cliente; chat caerá al server default.
      return null;
    }
  } else {
    // Legacy plaintext. Usar tal cual y agendar re-encrypt.
    plaintext = user.customApiKey;
    needsReencrypt = true;
  }

  if (needsReencrypt) {
    // Fire-and-forget: el chat no espera. Si falla, lo intentamos la
    // próxima vez que el usuario use la clave.
    void prisma.user
      .update({ where: { id: userId }, data: { customApiKey: encrypt(plaintext) } })
      .then(() => logger.info("byok_reencrypted", { userId }))
      .catch((err) =>
        logger.error("byok_reencrypt_failed", {
          userId,
          err: err instanceof Error ? err.message : String(err),
        }),
      );
  }

  return {
    provider: user.customProvider as LoadedBYOK["provider"],
    apiKey: plaintext,
    model: user.customModel,
  };
}
