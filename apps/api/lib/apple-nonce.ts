import { createHash } from "crypto";
import { prisma } from "@atelier/db";

export const APPLE_NONCE_IDENTIFIER = "apple-auth-nonce";

export function hashAppleNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

export async function consumeAppleNonce(nonce: string): Promise<boolean> {
  const result = await prisma.verificationToken.deleteMany({
    where: {
      identifier: APPLE_NONCE_IDENTIFIER,
      token: hashAppleNonce(nonce),
      expires: { gt: new Date() },
    },
  });
  return result.count === 1;
}
