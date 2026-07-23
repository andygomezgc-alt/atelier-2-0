import { NextRequest, NextResponse } from "next/server";
import {
  AppleAuthError,
  exchangeAppleAuthorizationCode,
  verifyAppleIdToken,
} from "@/lib/apple-auth";
import { encryptAppleToken } from "@/lib/apple-token-crypto";
import { consumeAppleNonce } from "@/lib/apple-nonce";
import { logger } from "@/lib/logger";
import { createMobileSession } from "@/lib/mobile-session";
import { OAuthIdentityError, resolveOAuthIdentity } from "@/lib/oauth-identity";

export const dynamic = "force-dynamic";

type AppleLoginBody = {
  identityToken?: unknown;
  authorizationCode?: unknown;
  nonce?: unknown;
  name?: unknown;
};

function textField(value: unknown, maxLength: number): string {
  return typeof value === "string" && value.length <= maxLength ? value.trim() : "";
}

function appleFailure(status: number) {
  return NextResponse.json(
    { error: "No se pudo validar el ingreso con Apple", code: "apple_signin_failed" },
    { status },
  );
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as AppleLoginBody | null;
  const identityToken = textField(body?.identityToken, 16_384);
  const authorizationCode = textField(body?.authorizationCode, 4_096);
  const nonce = textField(body?.nonce, 256);
  // Apple only exposes the name on the first authorization. It is display data,
  // never an authorization decision, so it is safe to accept after sanitizing.
  const name = textField(body?.name, 200) || null;

  if (!identityToken || !authorizationCode || !nonce) return appleFailure(400);

  try {
    const profile = await verifyAppleIdToken(identityToken, nonce);
    if (!(await consumeAppleNonce(nonce))) {
      logger.warn("mobile_apple_nonce_rejected");
      return appleFailure(401);
    }

    const appleTokens = await exchangeAppleAuthorizationCode(authorizationCode);
    const exchangedProfile = await verifyAppleIdToken(appleTokens.idToken);
    if (exchangedProfile.subject !== profile.subject) {
      throw new AppleAuthError("apple_subject_mismatch");
    }

    const encryptedRefreshToken = encryptAppleToken(appleTokens.refreshToken);
    const user = await resolveOAuthIdentity({
      provider: "apple",
      providerAccountId: profile.subject,
      email: profile.email ?? exchangedProfile.email,
      name,
      tokens: {
        refreshToken: encryptedRefreshToken,
      },
    });

    logger.info("mobile_apple_success", {
      userId: user.id,
      privateEmail: profile.isPrivateEmail,
    });
    return NextResponse.json(await createMobileSession(user));
  } catch (error) {
    const reason =
      error instanceof AppleAuthError || error instanceof OAuthIdentityError
        ? error.message
        : error instanceof Error
          ? error.message
          : "unknown";
    const status =
      reason === "oauth_provider_conflict"
        ? 409
        : reason === "apple_unavailable" || reason.startsWith("apple_exchange_")
          ? 502
          : error instanceof AppleAuthError ||
              error instanceof OAuthIdentityError
            ? reason === "apple_not_configured" || reason === "apple_private_key_invalid"
              ? 500
              : 401
            : 500;
    if (status >= 500) logger.error("mobile_apple_failed", { reason, status });
    else logger.warn("mobile_apple_failed", { reason, status });
    return appleFailure(status);
  }
}
