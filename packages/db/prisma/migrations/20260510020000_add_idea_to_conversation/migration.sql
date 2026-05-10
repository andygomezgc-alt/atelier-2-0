-- Make Conversation.ideaId 1:1 with Idea, so a single conversation belongs to a single idea.
-- Existing conversations with ideaId=NULL are kept (Postgres allows multiple NULLs in a UNIQUE column).
-- onDelete is changed from SET NULL to CASCADE so deleting an idea also removes its conversation
-- (matches the "one conversation per idea" piloto contract; chat is meaningless without its idea).

-- Drop the existing FK so we can replace it with CASCADE.
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_ideaId_fkey";

-- Enforce 1:1 between Idea and Conversation.
-- Migration aborts here if duplicates exist for the same non-null ideaId.
CREATE UNIQUE INDEX "Conversation_ideaId_key" ON "Conversation"("ideaId");

-- Re-add FK with CASCADE delete.
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ideaId_fkey"
  FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
