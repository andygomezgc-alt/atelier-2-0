import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { SignJWT } from "jose";
import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Tokens are stored hashed at rest (see request/route.ts). Hash the
// incoming plaintext before any DB lookup or delete.
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

function getSecret() {
  const secret = process.env.MOBILE_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("MOBILE_JWT_SECRET or NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token = (body?.token ?? "").trim();
  const email = (body?.email ?? "").toLowerCase().trim();

  if (!token || !email) {
    return NextResponse.json({ error: "token y email son requeridos" }, { status: 400 });
  }

  const tokenHash = hashToken(token);

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token: tokenHash } },
  });

  if (!record) {
    logger.warn("mobile_auth_invalid_token", { email });
    return NextResponse.json({ error: "Token no válido" }, { status: 401 });
  }

  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token: tokenHash } },
    });
    logger.warn("mobile_auth_token_expired", { email });
    return NextResponse.json({ error: "Token expirado" }, { status: 401 });
  }

  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier: email, token: tokenHash } },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: email.split("@")[0] },
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
    },
  });

  const accessToken = await new SignJWT({ sub: user.id, email: user.email, tv: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("atelier-mobile")
    .setAudience("atelier-api")
    .setExpirationTime("30d")
    .sign(getSecret());

  logger.info("mobile_auth_success", { userId: user.id, email });
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
    },
  });
}
