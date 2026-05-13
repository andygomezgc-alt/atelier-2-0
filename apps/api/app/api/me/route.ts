import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchMeRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { projectMe, meSelect } from "@/lib/projections";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: meSelect,
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json(projectMe(user));
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  const body = await req.json();
  const parse = PatchMeRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  // BYOK: cifrar la clave del LLM antes de persistirla. null se respeta
  // (limpia la clave). Strings vacíos se tratan como "no cambia".
  const data = { ...parse.data };
  if (data.customApiKey !== undefined) {
    if (data.customApiKey === null || data.customApiKey === "") {
      data.customApiKey = null;
    } else {
      data.customApiKey = encrypt(data.customApiKey);
    }
  }

  const updated = await prisma.user.update({
    where: { id: ctx.userId },
    data,
    select: meSelect,
  });

  return NextResponse.json(projectMe(updated));
}
