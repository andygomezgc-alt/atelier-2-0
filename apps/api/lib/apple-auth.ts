import {
  SignJWT,
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  type JWTPayload,
} from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));

export class AppleAuthError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export type AppleProfile = {
  subject: string;
  email: string | null;
  isPrivateEmail: boolean;
};

export type AppleTokenResponse = {
  refreshToken: string;
  idToken: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AppleAuthError("apple_not_configured");
  return value;
}

export function appleClientId(): string {
  return requiredEnv("APPLE_CLIENT_ID");
}

export function extractAppleProfile(
  payload: JWTPayload,
  expectedNonce?: string,
): AppleProfile {
  const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!subject) throw new AppleAuthError("apple_subject_missing");

  if (expectedNonce && payload.nonce !== expectedNonce) {
    throw new AppleAuthError("apple_nonce_mismatch");
  }

  const rawEmail = typeof payload.email === "string" ? payload.email.trim() : "";
  const email = rawEmail ? rawEmail.toLowerCase() : null;
  if (email) {
    const verified = (payload as { email_verified?: unknown }).email_verified;
    if (verified !== true && verified !== "true") {
      throw new AppleAuthError("apple_email_unverified");
    }
  }

  const privateClaim = (payload as { is_private_email?: unknown }).is_private_email;
  return {
    subject,
    email,
    isPrivateEmail: privateClaim === true || privateClaim === "true",
  };
}

export async function verifyAppleIdToken(
  idToken: string,
  expectedNonce?: string,
): Promise<AppleProfile> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: appleClientId(),
      algorithms: ["RS256"],
      requiredClaims: ["sub", "iat", "exp"],
    }));
  } catch (error) {
    if (error instanceof AppleAuthError) throw error;
    throw new AppleAuthError("apple_token_invalid");
  }
  return extractAppleProfile(payload, expectedNonce);
}

async function appleClientSecret(): Promise<string> {
  const clientId = appleClientId();
  const teamId = requiredEnv("APPLE_TEAM_ID");
  const keyId = requiredEnv("APPLE_KEY_ID");
  const privateKey = requiredEnv("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");

  let key;
  try {
    key = await importPKCS8(privateKey, "ES256");
  } catch {
    throw new AppleAuthError("apple_private_key_invalid");
  }

  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .sign(key);
}

async function appleFormRequest(
  path: "/auth/token" | "/auth/revoke",
  form: URLSearchParams,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(`${APPLE_ISSUER}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    throw new AppleAuthError("apple_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
): Promise<AppleTokenResponse> {
  const form = new URLSearchParams({
    client_id: appleClientId(),
    client_secret: await appleClientSecret(),
    code: authorizationCode,
    grant_type: "authorization_code",
  });
  const response = await appleFormRequest("/auth/token", form);
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const appleError = typeof body?.error === "string" ? body.error : "unknown";
    throw new AppleAuthError(`apple_exchange_${appleError}`);
  }

  if (
    typeof body?.access_token !== "string" ||
    typeof body.refresh_token !== "string" ||
    typeof body.id_token !== "string" ||
    typeof body.expires_in !== "number" ||
    typeof body.token_type !== "string"
  ) {
    throw new AppleAuthError("apple_exchange_invalid_response");
  }
  return {
    refreshToken: body.refresh_token,
    idToken: body.id_token,
  };
}

export async function revokeAppleRefreshToken(refreshToken: string): Promise<void> {
  const form = new URLSearchParams({
    client_id: appleClientId(),
    client_secret: await appleClientSecret(),
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  const response = await appleFormRequest("/auth/revoke", form);
  if (!response.ok) throw new AppleAuthError("apple_revoke_failed");
}
