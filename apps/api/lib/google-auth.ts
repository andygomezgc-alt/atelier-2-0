import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Llaves públicas de Google para verificar la firma del idToken.
// createRemoteJWKSet cachea y rota las llaves solo.
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleProfile = {
  subject: string;
  email: string;
  name: string | null;
  picture: string | null;
};

/**
 * Client IDs cuyo `aud` aceptamos. google-signin emite el idToken con
 * aud = webClientId; permitimos también el de iOS por las dudas.
 */
export function googleAudiences(): string[] {
  return [process.env.GOOGLE_WEB_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID].filter(
    (v): v is string => !!v && v.length > 0,
  );
}

/**
 * Valida los claims de negocio de un idToken YA verificado criptográficamente
 * (firma/iss/aud/exp los chequea jwtVerify). Pura y testeable: solo mira email
 * y email_verified. Lanza Error con mensaje-código.
 */
export function extractGoogleProfile(payload: JWTPayload): GoogleProfile {
  const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!subject) throw new Error("google_subject_missing");
  const email =
    typeof payload.email === "string" ? payload.email.toLowerCase().trim() : "";
  if (!email) throw new Error("google_no_email");
  if ((payload as { email_verified?: unknown }).email_verified !== true) {
    throw new Error("google_email_unverified");
  }
  const name =
    typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;
  const picture =
    typeof payload.picture === "string" && payload.picture ? payload.picture : null;
  return { subject, email, name, picture };
}

/**
 * Verifica firma + emisor + audiencia del idToken contra las llaves públicas
 * de Google y devuelve el perfil. Lanza si el token es inválido o no cumple
 * los claims de negocio.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const audience = googleAudiences();
  if (audience.length === 0) throw new Error("google_not_configured");
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUERS,
    audience,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "iat", "exp"],
  });
  return extractGoogleProfile(payload);
}
