import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { BulkMessagesRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";

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
    select: { id: true, restaurantId: true },
  });
  if (!conv || conv.restaurantId !== ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  if (parse.data.messages.length === 0) {
    return Response.json({ inserted: 0 });
  }

  await prisma.message.createMany({
    data: parse.data.messages.map((m) => ({
      conversationId,
      role: m.role,
      content: m.content,
    })),
  });

  return Response.json({ inserted: parse.data.messages.length });
}
