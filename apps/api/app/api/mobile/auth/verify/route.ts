import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { SignJWT } from "jose";

export const dynamic = "force-dynamic";

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token = (body?.token ?? "").trim();
  const email = (body?.email ?? "").toLowerCase().trim();

  if (!token || !email) {
    return NextResponse.json({ error: "token y email son requeridos" }, { status: 400 });
  }

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });

  if (!record) {
    return NextResponse.json({ error: "Token no válido" }, { status: 401 });
  }

  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token } },
    });
    return NextResponse.json({ error: "Token expirado" }, { status: 401 });
  }

  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier: email, token } },
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
      restaurant: { select: { name: true } },
    },
  });

  const accessToken = await new SignJWT({ sub: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());

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
