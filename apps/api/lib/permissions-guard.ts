import { auth } from "@/lib/auth";
import { prisma } from "@atelier/db";
import { can, type Permission } from "@atelier/shared";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { Role } from "@atelier/db";

export type AuthedContext = {
  userId: string;
  role: Role;
  restaurantId: string;
};

function getSecret() {
  const secret = process.env.MOBILE_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("MOBILE_JWT_SECRET or NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

async function bearerClaims(
  req: NextRequest,
): Promise<{ userId: string; tv: number | null } | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(auth.slice(7), getSecret(), {
      issuer: "atelier-mobile",
      audience: "atelier-api",
    });
    const userId = (payload.sub as string) ?? null;
    if (!userId) return null;
    const tv = typeof payload.tv === "number" ? payload.tv : null;
    return { userId, tv };
  } catch {
    return null;
  }
}

function unauthorizedRevoked() {
  return NextResponse.json(
    { error: "Token revoked" },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
    },
  );
}

export async function requireAuth(
  req: NextRequest,
  permission?: Permission,
): Promise<AuthedContext | NextResponse> {
  const bearer = await bearerClaims(req);
  let userId: string | null = bearer?.userId ?? null;

  if (!userId) {
    const session = await auth();
    userId = session?.user?.id ?? null;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, restaurantId: true, tokenVersion: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // For Bearer-authenticated requests, enforce tokenVersion match.
  if (bearer && bearer.tv !== null && user.tokenVersion !== bearer.tv) {
    return unauthorizedRevoked();
  }

  if (permission && !user.restaurantId) {
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  }

  if (permission && user.role && !can(user.role, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return {
    userId: user.id,
    role: user.role ?? "viewer",
    restaurantId: user.restaurantId ?? "",
  };
}

export function isNextResponse(val: unknown): val is NextResponse {
  return val instanceof NextResponse;
}
