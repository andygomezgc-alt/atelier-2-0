// DEV-ONLY auth shortcut. Skips the magic-link round trip so the app can
// start at the restaurant-creation step for manual testing. Refuses to run
// outside development to prevent accidental exposure in production.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { SignJWT } from "jose";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function getSecret() {
  const secret = process.env.MOBILE_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("MOBILE_JWT_SECRET or NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const email = (body?.email ?? "dev@atelier.test").toLowerCase().trim();
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  // A-12 — el dev-login YA NO regala restaurante: con la app autoexplicada
  // los users nuevos caen en (tabs) sin restaurante y disparan el lazy
  // create al primer guardado. Si el user nuevo se le auto-asignaba un
  // "Dev Kitchen" acá, se saltaba justo el flujo que A-12 quiere validar
  // y, peor, ensuciaba la DB con duplicados de Dev Kitchen al ritmo de
  // los emails de prueba.
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

  logger.info("mobile_auth_dev_login", { userId: user.id, email });
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
