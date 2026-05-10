-- Indexes, explicit cascade rules, and soft-delete on Recipe.

-- ─────────── Foreign-key cascade updates ───────────

-- User.restaurant: SetNull
ALTER TABLE "User" DROP CONSTRAINT "User_restaurantId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Idea.author: Restrict
ALTER TABLE "Idea" DROP CONSTRAINT "Idea_authorId_fkey";
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Conversation.author: Restrict
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_authorId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Conversation.idea: SetNull
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_ideaId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ideaId_fkey"
  FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Recipe.author: Restrict
ALTER TABLE "Recipe" DROP CONSTRAINT "Recipe_authorId_fkey";
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Recipe.approvedBy: SetNull
ALTER TABLE "Recipe" DROP CONSTRAINT "Recipe_approvedById_fkey";
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Recipe.sourceConversation: SetNull
ALTER TABLE "Recipe" DROP CONSTRAINT "Recipe_sourceConversationId_fkey";
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_sourceConversationId_fkey"
  FOREIGN KEY ("sourceConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MenuItem.recipe: Restrict
ALTER TABLE "MenuItem" DROP CONSTRAINT "MenuItem_recipeId_fkey";
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_recipeId_fkey"
  FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────── Soft-delete on Recipe ───────────

ALTER TABLE "Recipe" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- ─────────── New indexes ───────────

CREATE INDEX "Recipe_restaurantId_title_idx" ON "Recipe"("restaurantId", "title");
CREATE INDEX "Recipe_restaurantId_deletedAt_idx" ON "Recipe"("restaurantId", "deletedAt");
CREATE INDEX "MenuFolder_restaurantId_updatedAt_idx" ON "MenuFolder"("restaurantId", "updatedAt");
CREATE INDEX "Conversation_authorId_createdAt_idx" ON "Conversation"("authorId", "createdAt");
