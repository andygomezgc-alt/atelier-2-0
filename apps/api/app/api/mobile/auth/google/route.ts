import { NextRequest, NextResponse } from "next/server";
import { verifyGoogleIdToken } from "@/lib/google-auth";
import { logger } from "@/lib/logger";
import { createMobileSession } from "@/lib/mobile-session";
import { resolveOAuthIdentity } from "@/lib/oauth-identity";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const idToken = (body?.idToken ?? "").trim();

  if (!idToken) {
    return NextResponse.json(
      { error: "Falta el token de Google", code: "token_missing" },
      { status: 400 },
    );
  }

  // Verifica firma + emisor + audiencia contra las llaves públicas de Google.
  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    logger.warn("mobile_google_invalid_token", { reason });
    // google_not_configured es error nuestro (env faltante), el resto es del
    // cliente. Al usuario le mostramos siempre el mismo mensaje amable.
    const status = reason === "google_not_configured" ? 500 : 401;
    return NextResponse.json(
      { error: "No se pudo validar el ingreso con Google", code: "google_signin_failed" },
      { status },
    );
  }

  const user = await resolveOAuthIdentity({
    provider: "google",
    providerAccountId: profile.subject,
    email: profile.email,
    name: profile.name,
    photoUrl: profile.picture,
  });

  logger.info("mobile_google_success", { userId: user.id, email: user.email });
  return NextResponse.json(await createMobileSession(user));
}
