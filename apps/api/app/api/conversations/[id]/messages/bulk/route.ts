import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { BulkMessagesRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { canAccessConversation } from "@/lib/conversation-access";

export const dynamic = "force-dynamic";

// A-12 — hidratación post-hoc de Mensajes. El chef habla con el Asistente en
// modo preview (sin restaurante); cuando aprieta "Guardar como receta" se
// dispara el lazy-create del restaurante + creación de la Conversation real,
// y los mensajes acumulados localmente se suben acá en una sola request
// (no requiere streamear ni llamar al modelo: es INSERT bulk puro).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });

  const { id: conversationId } = await params;

  const body = await req.json();
  const parse = BulkMessagesRequestSchema.safeParse(body);
  if (!parse.success)
    return new Response(JSON.stringify({ error: parse.error.flatten() }), { status: 400 });

  // IDOR: la Conversation tiene que pertenecer al restaurante del caller.
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, restaurantId: true, authorId: true, ideaId: true, idea: { select: { authorId: true } } },
  });
  // Visibility rule shared with the other chat routes: a chat the caller cannot see is a 404.
  if (!conv || conv.restaurantId !== ctx.restaurantId || !canAccessConversation(conv, ctx))
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  if (parse.data.messages.length === 0) {
    return Response.json({ inserted: 0 });
  }

  // Explicit timestamps keep client order: the default now() is identical for every row of one
  // INSERT, and history is read ordered by createdAt. The base starts after the latest stored message,
  // so chunks uploaded by other instances (clock skew) still sort after what is already stored.
  // skipDuplicates makes a replayed batch insert only the messages not stored yet; the count is the
  // rows this request actually wrote.
  const { count } = await prisma.$transaction(async (tx) => {
    const latest = await tx.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const base = Math.max(Date.now(), latest ? latest.createdAt.getTime() + 1 : 0);
    return tx.message.createMany({
      data: parse.data.messages.map((m, i) => ({
        conversationId,
        role: m.role,
        content: m.content,
        createdAt: new Date(base + i),
        ...(m.clientMessageId ? { clientMessageId: m.clientMessageId } : {}),
      })),
      skipDuplicates: true,
    });
  });

  return Response.json({ inserted: count });
}
