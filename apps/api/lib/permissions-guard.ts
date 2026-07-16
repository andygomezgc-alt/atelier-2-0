import { auth } from "@/lib/auth";
import { prisma } from "@atelier/db";
import { can, type Permission } from "@atelier/shared";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { Role, PlanStatus } from "@atelier/db";

export type AuthedContext = {
  userId: string;
  role: Role;
  restaurantId: string;
};

// Candado de plan (entitlements). Prefijos exentos aunque la request sea de
// escritura: auth (login), pago (Stripe) y onboarding (join/leave). Los datos
// del chef nunca se bloquean en lectura, por eso el candado solo mira ≠ GET.
const ENTITLEMENT_EXEMPT_PREFIXES = [
  "/api/mobile/auth",
  "/api/stripe",
  "/api/restaurant/join",
  "/api/restaurant/leave",
];

function isPlanInactive(r: {
  planStatus: PlanStatus;
  graceUntil: Date | null;
  trialEndsAt: Date | null;
}): boolean {
  const now = Date.now();
  if (r.planStatus === "canceled") return true;
  if (r.planStatus === "past_due") return r.graceUntil !== null && r.graceUntil.getTime() < now;
  if (r.planStatus === "trial") return r.trialEndsAt !== null && r.trialEndsAt.getTime() < now;
  return false;
}

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

  // P2-4 (auditoría jul 2026): un Bearer sin claim `tv` esquivaba la revocación
  // (el chequeo de abajo solo compara cuando tv !== null). Hoy TODOS los
  // emisores (verify/google/dev-login) firman el token con tv, así que ningún
  // token legítimo carece de él — un Bearer sin tv es o un token viejo
  // pre-revocación o uno manipulado. Cerramos esa vía rechazándolo directo.
  if (bearer && bearer.tv === null) {
    return unauthorizedRevoked();
  }

  // For Bearer-authenticated requests, enforce tokenVersion match.
  if (bearer && bearer.tv !== null && user.tokenVersion !== bearer.tv) {
    return unauthorizedRevoked();
  }

  if (permission && !user.restaurantId) {
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  }

  if (permission && user.role && !can(user.role, permission)) {
    // Code `forbidden` → el mobile lo traduce al idioma del chef. Cubre TODAS
    // las rutas con permiso de una (ej. un sous_chef intentando una acción admin).
    return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  }

  // Candado de plan — APAGADO por defecto. Solo con ENTITLEMENTS_ENFORCED=1
  // hacemos la query extra al restaurante. Sin la env, cero queries y cero
  // cambios de comportamiento. Nunca bloquea GET (lecturas/export = del chef).
  if (
    process.env.ENTITLEMENTS_ENFORCED === "1" &&
    req.method !== "GET" &&
    user.restaurantId &&
    !ENTITLEMENT_EXEMPT_PREFIXES.some((p) => req.nextUrl.pathname.startsWith(p))
  ) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { planStatus: true, graceUntil: true, trialEndsAt: true },
    });
    if (restaurant && isPlanInactive(restaurant)) {
      return NextResponse.json(
        { error: "Plan inactive", code: "plan_inactive" },
        { status: 402 },
      );
    }
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
