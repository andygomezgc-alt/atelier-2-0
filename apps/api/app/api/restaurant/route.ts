import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateRestaurantRequestSchema, PatchRestaurantRequestSchema } from "@atelier/shared";
import { generateInviteCode } from "@atelier/shared/invite-code";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { projectRestaurant, restaurantInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

// P2-2: se lanza dentro de la tx de creación para revertir el restaurante si el
// usuario ya estaba en uno (el guard `restaurantId: null` no reclamó su fila).
class AlreadyInRestaurantError extends Error {}

// TODO: dedupe with restaurant/join/route.ts if a 3rd usage appears.
function validateOrigin(req: NextRequest): NextResponse | null {
  // Skip for Bearer auth (mobile) — no same-origin Origin header expected.
  if (req.headers.get("authorization")?.startsWith("Bearer ")) return null;

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return NextResponse.json({ error: "CSRF: invalid origin" }, { status: 403 });
  }

  const origin = req.headers.get("origin");
  if (origin && origin !== process.env.NEXTAUTH_URL) {
    return NextResponse.json({ error: "CSRF: invalid origin" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  if (!ctx.restaurantId) {
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 404 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: ctx.restaurantId },
    include: restaurantInclude,
  });

  if (!restaurant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(projectRestaurant(restaurant));
}

export async function POST(req: NextRequest) {
  const csrf = validateOrigin(req);
  if (csrf) return csrf;

  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  if (ctx.restaurantId) {
    return NextResponse.json({ error: "Already in a restaurant", code: "already_in_restaurant" }, { status: 409 });
  }

  const body = await req.json();
  const parse = CreateRestaurantRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const inviteCode = generateInviteCode(parse.data.name);

  // P2-2 (auditoría bugs jul 2026): crear el restaurante y reclamar al usuario
  // van en UNA transacción. El `updateMany` con guard `restaurantId: null`
  // reevaluado dentro de la tx cierra la carrera del doble-POST: el segundo
  // toca 0 filas (el usuario ya tiene restaurante) → `throw` → rollback → el
  // restaurante recién creado NO queda huérfano con código válido y 0 miembros.
  let restaurant: { id: string; name: string; inviteCode: string };
  try {
    restaurant = await prisma.$transaction(async (tx) => {
      const created = await tx.restaurant.create({
        data: {
          name: parse.data.name,
          identityLine: parse.data.identityLine,
          inviteCode,
        },
      });
      const claim = await tx.user.updateMany({
        where: { id: ctx.userId, restaurantId: null },
        data: { restaurantId: created.id, role: "admin" },
      });
      if (claim.count === 0) throw new AlreadyInRestaurantError();
      return created;
    });
  } catch (err) {
    if (err instanceof AlreadyInRestaurantError) {
      return NextResponse.json(
        { error: "Already in a restaurant", code: "already_in_restaurant" },
        { status: 409 },
      );
    }
    throw err;
  }

  // Devolvemos `role` también: el cliente lo usa con patchLocalUser para
  // actualizar auth-state sin un GET /me extra (A-10 / Ola 0 0.2).
  return NextResponse.json(
    {
      id: restaurant.id,
      name: restaurant.name,
      inviteCode: restaurant.inviteCode,
      role: "admin",
    },
    { status: 201 },
  );
}

// Admin-only: rename the restaurant (used from the export preview so the chef
// can tweak how the restaurant is branded on a printed menu) or update its
// identity line. NOT a per-menu override — this is the canonical name.
export async function PATCH(req: NextRequest) {
  const csrf = validateOrigin(req);
  if (csrf) return csrf;

  const ctx = await requireAuth(req, "edit_restaurant");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 404 });

  const body = await req.json();
  const parse = PatchRestaurantRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const data: { name?: string; identityLine?: string | null } = {};
  if (parse.data.name !== undefined) data.name = parse.data.name;
  if (parse.data.identityLine !== undefined) data.identityLine = parse.data.identityLine;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.update({
    where: { id: ctx.restaurantId },
    data,
    include: restaurantInclude,
  });

  return NextResponse.json(projectRestaurant(restaurant));
}
