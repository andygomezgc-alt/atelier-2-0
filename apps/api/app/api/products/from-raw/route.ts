import { NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { z } from "zod";
import { withAuth } from "@/lib/with-auth";
import { projectProductDetail } from "@/lib/products/projections";
import { lockRecipeSave, resolveIngredientDrafts } from "@/lib/products/recipe-save";

export const dynamic = "force-dynamic";
const FromRawRequestSchema = z.object({ rawText: z.string().min(1).max(500) });
export const POST = withAuth({ permission: "edit_recipe", body: FromRawRequestSchema }, async (ctx, body) => {
  const product = await prisma.$transaction(async tx => {
    await lockRecipeSave(tx, ctx.restaurantId);
    const [ingredient] = await resolveIngredientDrafts(tx, ctx.restaurantId, [{ rawText: body.rawText, createProductDraft: true }]);
    return tx.product.findUniqueOrThrow({ where: { id: ingredient!.productId! } });
  }, { timeout: 30_000, maxWait: 10_000 });
  return NextResponse.json(projectProductDetail(product), { status: 201 });
});
