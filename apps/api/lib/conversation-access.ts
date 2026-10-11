import type { Prisma, Role } from "@atelier/db";

type Caller = { userId: string; role: Role };

/**
 * Chats without an idea are shared with the restaurant team. A chat born from
 * an idea is private: only its author, the idea's author (they can differ in
 * legacy rows where a teammate opened the idea) and admins can see and use it.
 * Restaurant scoping stays with each caller.
 */
export function canAccessConversation(
  conversation: { authorId: string; ideaId: string | null; idea: { authorId: string } | null },
  caller: Caller,
): boolean {
  return conversation.ideaId === null || caller.role === "admin"
    || conversation.authorId === caller.userId || conversation.idea?.authorId === caller.userId;
}

/** The same rule as a query filter, so lists are filtered before pagination. */
export function accessibleConversationsWhere(restaurantId: string, caller: Caller): Prisma.ConversationWhereInput {
  if (caller.role === "admin") return { restaurantId };
  return { restaurantId, OR: [{ ideaId: null }, { authorId: caller.userId }, { idea: { authorId: caller.userId } }] };
}
