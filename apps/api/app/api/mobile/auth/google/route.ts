import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { SignJWT } from "jose";
import { verifyGoogleIdToken } from "@/lib/google-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function getSecret() {
  const secret = process.env.MOBILE_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("MOBILE_JWT_SECRET or NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

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

  const user = await prisma.user.upsert({
    where: { email: profile.email },
    update: {},
    create: {
      email: profile.email,
      name: profile.name ?? profile.email.split("@")[0] ?? profile.email,
      photoUrl: profile.picture,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      restaurantId: true,
      languagePref: true,
      defaultModel: true,
      tokenVersion: true,
      restaurant: { select: { name: true } },
      customProvider: true,
      customModel: true,
      customApiKey: true,
    },
  });

  const accessToken = await new SignJWT({
    sub: user.id,
    email: user.email,
    tv: user.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("atelier-mobile")
    .setAudience("atelier-api")
    .setExpirationTime("30d")
    .sign(getSecret());

  logger.info("mobile_google_success", { userId: user.id, email: user.email });
  return NextResponse.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email ?? "",
      name: user.name ?? user.email ?? "",
      role: user.role ?? "viewer",
      restaurantId: user.restaurantId,
      restaurantName: user.restaurant?.name ?? null,
      languagePref: user.languagePref ?? "es",
      defaultModel: user.defaultModel ?? "sonnet",
      customProvider: user.customProvider,
      customModel: user.customModel,
      customApiKeySet: !!(user.customApiKey && user.customApiKey.length > 0),
    },
  });
}
