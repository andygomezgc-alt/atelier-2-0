import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { uploadPhoto } from "@/lib/blob";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "edit_restaurant");
  if (isNextResponse(ctx)) return ctx;

  const form = await req.formData();
  const file = form.get("photo");
  if (!file || !(file instanceof Blob))
    return NextResponse.json({ error: "Missing photo" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadPhoto(buffer, `restaurants/${ctx.restaurantId}`, file.type || "image/jpeg");

  if (!url)
    return NextResponse.json(
      { error: "Blob storage not configured (BLOB_READ_WRITE_TOKEN missing)" },
      { status: 500 },
    );

  await prisma.restaurant.update({
    where: { id: ctx.restaurantId },
    data: { photoUrl: url },
  });
  return NextResponse.json({ photoUrl: url });
}
