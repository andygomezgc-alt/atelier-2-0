import { NextRequest } from "next/server";
import Anthropic, { APIUserAbortError } from "@anthropic-ai/sdk";
import { prisma, Prisma } from "@atelier/db";
import { PostMessageRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { buildSystemBlocks, MODEL_IDS, type Msg } from "@/lib/anthropic";
import { reserveAiCall, recordAiTokens, aiQuotaExceededResponse } from "@/lib/ai-quota";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });
  const { id } = await params;

  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv || conv.restaurantId !== ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return Response.json(
    messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  // A-12 — el chef en estado needs-restaurant también puede usar el Asistente.
  // El cliente apunta a `/api/conversations/preview/messages` cuando todavía
  // no tiene restaurante. Acá ni buscamos Conversation ni persistimos nada;
  // el historial vive en memoria del cliente y nos lo manda en `body.history`.
  // Al "Guardar como receta" se crea el restaurante (lazy), luego la
  // Conversation real y se hidrata vía /messages/bulk en una sola llamada.
  const isPreview = conversationId === "preview";

  const ctx = isPreview
    ? await requireAuth(req)
    : await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!isPreview && !ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });

  const body = await req.json();
  const parse = PostMessageRequestSchema.safeParse(body);
  if (!parse.success)
    return new Response(JSON.stringify({ error: parse.error.flatten() }), { status: 400 });

  let restaurant: { name: string; identityLine: string | null } | null = null;
  let recentRecipes: { title: string; state: string }[] = [];
  let messages: Msg[] = [];
  let pinnedIdeaText: string | null = null;

  if (isPreview) {
    // Restaurante placeholder — el chef todavía no le puso nombre.
    restaurant = { name: "Tu cocina", identityLine: null };

    // El cliente manda `history: [{ role, content }, ...]` con los últimos
    // mensajes acumulados localmente (incluye el user msg actual ya pusheado
    // o no — defensivo).
    const rawHistory = Array.isArray((body as { history?: unknown }).history)
      ? ((body as { history: unknown[] }).history as unknown[])
      : [];
    messages = rawHistory
      .filter((m): m is { role: string; content: string } => {
        if (typeof m !== "object" || m === null) return false;
        const r = (m as { role?: unknown }).role;
        const c = (m as { content?: unknown }).content;
        return (r === "user" || r === "assistant") && typeof c === "string";
      })
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      .slice(-20);
    // Si el último mensaje no es el `content` que viene en este request,
    // lo agregamos al final (cliente correcto debería ya incluirlo).
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user" || last.content !== parse.data.content) {
      messages.push({ role: "user", content: parse.data.content });
    }

    const quota = await reserveAiCall(ctx.userId);
    if (!quota.ok) return aiQuotaExceededResponse(quota.retryAfter);
  } else {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { idea: { select: { text: true } } },
    });
    if (!conv || conv.restaurantId !== ctx.restaurantId)
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

    pinnedIdeaText = conv.idea?.text ?? null;

    // Chequeamos el tope diario antes de persistir el mensaje del user para no
    // dejar un mensaje huérfano sin respuesta si rebota el 429.
    const quota = await reserveAiCall(ctx.userId);
    if (!quota.ok) return aiQuotaExceededResponse(quota.retryAfter);

    // Persist user message before streaming. A retry keeps the same
    // clientMessageId: the unique constraint raises P2002, which means the turn
    // is already present and we can safely make a fresh model call.
    try {
      await prisma.message.create({
        data: {
          conversationId,
          role: "user",
          content: parse.data.content,
          ...(parse.data.clientMessageId
            ? { clientMessageId: parse.data.clientMessageId }
            : {}),
        },
      });
    } catch (err) {
      const isDuplicateClientMessage =
        parse.data.clientMessageId &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002";
      if (!isDuplicateClientMessage) throw err;
    }

    // Build context: recent recipes + pinned idea.
    const [r, recent, history] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: ctx.restaurantId },
        select: { name: true, identityLine: true },
      }),
      prisma.recipe.findMany({
        where: { restaurantId: ctx.restaurantId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { title: true, state: true },
      }),
      // Sliding window: solo re-enviamos los últimos 20 mensajes a Claude. Más
      // allá de ese tope la conversación crece linealmente en costo/latencia sin
      // agregar señal útil (Claude ya tiene los principios estables y la idea
      // anclada en el system prompt). Fetched desc para que `take` aplique al
      // final cronológico; revertimos abajo antes de armar el array de messages.
      prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { role: true, content: true },
      }),
    ]);

    if (!r)
      return new Response(JSON.stringify({ error: "Restaurant not found" }), { status: 404 });

    restaurant = r;
    recentRecipes = recent;
    messages = history
      .slice()
      .reverse()
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  }

  const system = buildSystemBlocks(restaurant, recentRecipes, pinnedIdeaText);
  // El mobile siempre manda `model` explícito (apps/mobile/src/api/conversations.ts).
  // Si un cliente futuro lo omite, default a Sonnet — barato/rápido para chat.
  // No usamos conv.modelUsed como fallback para evitar perpetuar Opus en turnos
  // cortos cuando la conversación fue creada con Opus para una pregunta puntual.
  const model = parse.data.model ?? "sonnet";

  const start = Date.now();

  // SSE stream — wire client AbortSignal so closing the connection cancels the
  // Anthropic upstream call (avoids burning tokens after the client disconnects).
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let assistantText = "";
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      let cachedTokens: number | undefined;
      let aborted = false;
      let errored = false;

      // A-05 — heartbeat cada 8s ANTES de que llegue el primer delta del
      // modelo. Mantiene viva la conexión y resetea el inactivity timer del
      // cliente (35s); también es la señal con la que mobile decide cuándo
      // mostrar el indicador "Atelier piensa •••". Se cancela apenas el
      // modelo emite el primer texto.
      let firstDeltaReceived = false;
      const heartbeatInterval = setInterval(() => {
        if (firstDeltaReceived || aborted || errored) return;
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "heartbeat", ts: Date.now() })}\n\n`,
            ),
          );
        } catch {
          // El cliente ya cerró; el finally limpia el interval.
        }
      }, 8_000);

      try {
        // Server's Anthropic key.
        const anthroStream = anthropic.messages.stream(
          {
            model: MODEL_IDS[model],
            // A-01b — antes 2048: las recetas largas (texto visible +
            // bloque <recipe_payload> al final) se cortaban en el cap.
            // Se cobra por tokens generados, no por max; los chats
            // simples no notan diferencia. Opus 5 piensa por defecto y
            // max_tokens cubre pensamiento + texto en el mismo presupuesto:
            // con 4096 la receta se cortaría a media respuesta.
            max_tokens: model === "opus" ? 16384 : 4096,
            system,
            messages,
            // Sonnet 5 defaults to effort=high; force low for chat workloads
            // to keep the cost/latency profile. Opus 5 uses its defaults
            // (adaptive thinking + effort=high) so "máxima profundidad" stays
            // meaningful — el pensamiento no se emite (display=omitted) y el
            // heartbeat cubre la pausa extra antes del primer delta de texto.
            // Haiku 4.5 does not support effort and would 400 if set.
            ...(model === "sonnet" && {
              thinking: { type: "disabled" as const },
              output_config: { effort: "low" as const },
            }),
          },
          { signal: req.signal },
        );

        for await (const event of anthroStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            if (!firstDeltaReceived) firstDeltaReceived = true;
            assistantText += event.delta.text;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "delta", text: event.delta.text })}\n\n`,
              ),
            );
          }
        }

        const final = await anthroStream.finalMessage();
        inputTokens = final.usage.input_tokens;
        outputTokens = final.usage.output_tokens;
        cachedTokens = final.usage.cache_read_input_tokens ?? 0;

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              inputTokens,
              outputTokens,
              cachedTokens,
            })}\n\n`,
          ),
        );
      } catch (err) {
        if (err instanceof APIUserAbortError || req.signal.aborted) {
          aborted = true;
        } else {
          errored = true;
          const rawMessage = err instanceof Error ? err.message : "stream error";
          // Provider errors arrive as deeply-nested JSON strings. Try to peel
          // one or two layers so the toast on mobile shows something readable
          // instead of "{\"error\":{\"message\":\"{\\n  \\\"error\\\":...".
          const message = extractFriendlyError(rawMessage);
          console.error(
            JSON.stringify({
              evt: "anthropic_stream_error",
              model,
              message,
              raw: rawMessage,
            }),
          );
          // Best-effort: client may already be gone if this was an abort path.
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`),
            );
          } catch {}
        }
      } finally {
        // A-05: parar heartbeats en cualquier salida (delta llegó, abort, error).
        clearInterval(heartbeatInterval);

        // Persistence policy: only persist the assistant turn on a clean completion.
        // On abort/error we skip persistence rather than storing partial text — the
        // Message schema has no "partial"/"error" flag and adding one requires a
        // Prisma migration (out of scope for this fix). The client can retry.
        // A-12: en modo preview NO persistimos — el cliente va a subir el
        // historial entero con /messages/bulk cuando cree el restaurante.
        if (!isPreview && assistantText && !aborted && !errored) {
          await prisma.message.create({
            data: {
              conversationId,
              role: "assistant",
              content: assistantText,
              inputTokens: inputTokens ?? null,
              outputTokens: outputTokens ?? null,
              cachedTokens: cachedTokens ?? null,
              latencyMs: Date.now() - start,
            },
          });
        }
        // Log per-message telemetry to server stdout (brief sec. 10).
        console.log(
          JSON.stringify({
            evt: "anthropic_message",
            model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cached_tokens: cachedTokens,
            latency_ms: Date.now() - start,
            aborted,
            partial_chars: aborted || errored ? assistantText.length : undefined,
          }),
        );
        // Sumar tokens gastados al contador diario (best-effort, ya reservamos
        // el slot antes de arrancar el stream).
        if (inputTokens || outputTokens) {
          await recordAiTokens(ctx.userId, inputTokens ?? 0, outputTokens ?? 0);
        }
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// Walk through nested error envelopes (provider SDKs often serialise an HTTP
// error body as a JSON string inside `error.message` of another JSON body) to
// surface a single human-readable line for the client toast.
function extractFriendlyError(raw: string): string {
  let current: unknown = raw;
  for (let i = 0; i < 4; i++) {
    if (typeof current !== "string") break;
    const trimmed = current.trim();
    if (!trimmed.startsWith("{")) break;
    try {
      current = JSON.parse(trimmed);
    } catch {
      break;
    }
    if (typeof current === "object" && current !== null) {
      const c = current as Record<string, unknown>;
      const inner = (c.error as Record<string, unknown> | undefined)?.message ?? c.message;
      if (typeof inner === "string") current = inner;
    }
  }
  if (typeof current === "string") return current.trim().split("\n")[0] || "stream error";
  return "stream error";
}
