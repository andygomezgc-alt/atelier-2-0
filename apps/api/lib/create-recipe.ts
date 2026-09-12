import { createHash } from "node:crypto";
import { prisma } from "@atelier/db";
import type { CreateRecipeRequest } from "@atelier/shared";
import { recipeListInclude } from "./projections";
import { lockRecipeSave, resolveIngredientDrafts, RecipeSaveError } from "./products/recipe-save";

export async function saveNewRecipe(restaurantId: string, userId: string, body: CreateRecipeRequest) {
  const requestHash = createHash("sha256").update(JSON.stringify({ ...body, clientRequestId: undefined })).digest("hex");
  return prisma.$transaction(async tx => {
    await lockRecipeSave(tx, restaurantId);
    if (body.clientRequestId) {
      const prior = await tx.recipe.findUnique({ where: { restaurantId_authorId_clientRequestId: { restaurantId, authorId: userId, clientRequestId: body.clientRequestId } }, include: recipeListInclude });
      if (prior) {
        if (prior.deletedAt || prior.requestHash !== requestHash) throw new RecipeSaveError("recipe_save_conflict", 409);
        return { recipe: prior, reused: true };
      }
    }
    const source = body.sourceConversationId ? await tx.conversation.findFirst({ where: { id: body.sourceConversationId, restaurantId }, select: { ideaId: true } }) : null;
    if (body.sourceConversationId && !source) throw new RecipeSaveError("invalid_conversation_reference");
    const rows = await resolveIngredientDrafts(tx, restaurantId, body.recipeIngredients ?? []);
    const created = await tx.recipe.create({ data: {
      restaurantId, authorId: userId, title: body.title, contentJson: body.contentJson,
      portions: body.portions ?? null, sourceConversationId: body.sourceConversationId ?? null,
      clientRequestId: body.clientRequestId ?? null, requestHash: body.clientRequestId ? requestHash : null,
      state: "draft", priority: false, version: 1,
    } });
    if (rows.length) await tx.recipeIngredient.createMany({ data: rows.map(row => ({ ...row, recipeId: created.id })) });
    if (source?.ideaId) await tx.idea.updateMany({ where: { id: source.ideaId, restaurantId, status: { not: "archived" } }, data: { status: "archived" } });
    const recipe = await tx.recipe.findUniqueOrThrow({ where: { id: created.id }, include: recipeListInclude });
    return { recipe, reused: false };
  }, { timeout: 30_000, maxWait: 10_000 });
}
