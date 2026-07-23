import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { APPLE_NONCE_IDENTIFIER, hashAppleNonce } from "@/lib/apple-nonce";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const limit = rateLimit(`apple-nonce:${ip}`, {
    max: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta más tarde.", code: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter ?? 60) },
      },
    );
  }

  const nonce = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({
      where: {
        identifier: APPLE_NONCE_IDENTIFIER,
        expires: { lt: now },
      },
    }),
    prisma.verificationToken.create({
      data: {
        identifier: APPLE_NONCE_IDENTIFIER,
        token: hashAppleNonce(nonce),
        expires: new Date(now.getTime() + 5 * 60 * 1000),
      },
    }),
  ]);

  return NextResponse.json(
    { nonce, state },
    { headers: { "Cache-Control": "no-store" } },
  );
}
