import { createHash } from "node:crypto";
import { prisma } from "@atelier/db";
import { importedRecipeState, type CreateRecipeRequest, type Role } from "@atelier/shared";
import { recipeListInclude } from "./projections";
import { ingredientDisplayLines, lockRecipeSave, resolveIngredientDrafts, RecipeSaveError } from "./products/recipe-save";
import { accessibleConversationsWhere } from "./conversation-access";

export async function saveNewRecipe(restaurantId: string, userId: string, body: CreateRecipeRequest, role: Role) {
  const requestHash = createHash("sha256").update(JSON.stringify({ ...body, clientRequestId: undefined })).digest("hex");
  return prisma.$transaction(async tx => {
    await lockRecipeSave(tx, restaurantId);
    if (body.clientRequestId) {
      const prior = await tx.recipe.findUnique({ where: { restaurantId_authorId_clientRequestId: { restaurantId, authorId: userId, clientRequestId: body.clientRequestId } }, include: recipeListInclude });
      if (prior) {
        if (prior.deletedAt || prior.requestHash !== requestHash) throw new RecipeSaveError("recipe_save_conflict", 409);
        return { recipe: prior, reused: true, importTicket: null };
      }
    }
    const source = body.sourceConversationId ? await tx.conversation.findFirst({ where: { id: body.sourceConversationId, ...accessibleConversationsWhere(restaurantId, { userId, role }) }, select: { ideaId: true } }) : null;
    if (body.sourceConversationId && !source) throw new RecipeSaveError("invalid_conversation_reference");
    const rows = await resolveIngredientDrafts(tx, restaurantId, body.recipeIngredients ?? []);
    // With structured rows, the flat list older app builds read is rebuilt from what was saved.
    const contentJson = rows.length ? { ...body.contentJson, ingredients: ingredientDisplayLines(rows) } : body.contentJson;
    // Imported recipes skip the draft so the culinary memory can learn from them right away.
    const state = body.origin === "import" ? importedRecipeState(role) : "draft";
    const created = await tx.recipe.create({ data: {
      restaurantId, authorId: userId, title: body.title, contentJson,
      portions: body.portions ?? null, sourceConversationId: body.sourceConversationId ?? null,
      clientRequestId: body.clientRequestId ?? null, requestHash: body.clientRequestId ? requestHash : null,
      state, ...(state === "approved" ? { approvedById: userId, approvedAt: new Date() } : {}), priority: false, version: 1,
    } });
    if (rows.length) await tx.recipeIngredient.createMany({ data: rows.map(row => ({ ...row, recipeId: created.id })) });
    if (source?.ideaId) await tx.idea.updateMany({ where: { id: source.ideaId, restaurantId, status: { not: "archived" } }, data: { status: "archived" } });
    // A new import in testing or approved takes the next import ticket of a memory that is on, in this
    // same transaction: the import run waits on it, and a later import's ticket makes an earlier run stop.
    // A raw Date is sent as timestamptz; store it in UTC like Prisma does, whatever the session time zone.
    const ticket = state === "draft" ? [] : await tx.$queryRaw<{ importTicket: number }[]>`UPDATE "CulinaryMemory"
      SET "importTicket" = "importTicket" + 1, "importPendingAt" = ${new Date()}::timestamptz AT TIME ZONE 'UTC'
      WHERE "restaurantId" = ${restaurantId} AND enabled RETURNING "importTicket"`;
    const recipe = await tx.recipe.findUniqueOrThrow({ where: { id: created.id }, include: recipeListInclude });
    return { recipe, reused: false, importTicket: ticket[0]?.importTicket ?? null };
  }, { timeout: 30_000, maxWait: 10_000 });
}
