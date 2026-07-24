import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Mocks elevados (el factory de vi.mock se iza sobre los consts).
const { db, guard, quota, anthro, streamMock, PrismaClientKnownRequestError } = vi.hoisted(() => {
  const db = {
    conversation: { findUnique: vi.fn() },
    message: { create: vi.fn(), findMany: vi.fn() },
    restaurant: { findUnique: vi.fn() },
    recipe: { findMany: vi.fn() },
  };
  const guard = {
    requireAuth: vi.fn(),
    isNextResponse: (v: unknown) =>
      typeof v === "object" && v !== null && "status" in v && "headers" in v,
  };
  const quota = {
    reserveAiCall: vi.fn(),
    recordAiTokens: vi.fn(async () => {}),
    aiQuotaExceededResponse: (_retryAfter: number) =>
      new Response(JSON.stringify({ error: "límite", code: "ai_daily_limit" }), {
        status: 429,
      }),
  };
  const streamMock = vi.fn();
  class Anthropic {
    messages = { stream: streamMock };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_opts: unknown) {}
  }
  class APIUserAbortError extends Error {}
  class PrismaClientKnownRequestError extends Error {
    code: string;

    constructor(code: string) {
      super(code);
      this.name = "PrismaClientKnownRequestError";
      this.code = code;
    }
  }
  return {
    db,
    guard,
    quota,
    anthro: { Anthropic, APIUserAbortError },
    streamMock,
    PrismaClientKnownRequestError,
  };
});

vi.mock("@atelier/db", () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError },
}));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/ai-quota", () => ({
  reserveAiCall: quota.reserveAiCall,
  recordAiTokens: quota.recordAiTokens,
  aiQuotaExceededResponse: quota.aiQuotaExceededResponse,
}));
// buildSystemBlocks queda stubbeado (lee el .md del disco), pero
// buildMessageBlocks corre de verdad: así el test comprueba que el breakpoint
// de caché llega al payload y no solo que la ruta llama a un stub.
vi.mock("@/lib/anthropic", async () => {
  const actual = await vi.importActual<typeof import("@/lib/anthropic")>("@/lib/anthropic");
  return {
    buildSystemBlocks: () => [{ type: "text", text: "sys" }],
    buildMessageBlocks: actual.buildMessageBlocks,
    MODEL_IDS: { haiku: "h", sonnet: "s", opus: "o" },
  };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: anthro.Anthropic,
  APIUserAbortError: anthro.APIUserAbortError,
}));

import * as route from "../route";

function anthropicStream(deltas: string[], usage: { in: number; out: number }) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const t of deltas)
        yield { type: "content_block_delta", delta: { type: "text_delta", text: t } };
    },
    finalMessage: async () => ({
      usage: { input_tokens: usage.in, output_tokens: usage.out, cache_read_input_tokens: 0 },
    }),
  };
}

function post(body: unknown, id = "conv-1") {
  const req = new NextRequest(`https://t.local/api/conversations/${id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return route.POST(req, { params: Promise.resolve({ id }) });
}

const assistantCreate = () =>
  db.message.create.mock.calls.find(
    (c) => (c[0] as { data: { role: string } }).data.role === "assistant",
  );

beforeEach(() => {
  db.conversation.findUnique.mockReset();
  db.message.create.mockReset().mockResolvedValue({});
  db.message.findMany.mockReset().mockResolvedValue([]);
  db.restaurant.findUnique.mockReset().mockResolvedValue({ name: "Kokoo", identityLine: null });
  db.recipe.findMany.mockReset().mockResolvedValue([]);
  guard.requireAuth.mockReset().mockResolvedValue({
    userId: "u1",
    restaurantId: "r1",
    role: "chef_executive",
  });
  quota.reserveAiCall.mockReset().mockResolvedValue({ ok: true, used: 1, limit: 120 });
  quota.recordAiTokens.mockClear();
  streamMock.mockReset();
  db.conversation.findUnique.mockResolvedValue({
    id: "conv-1",
    restaurantId: "r1",
    idea: { text: null },
  });
});

describe("POST chat — persistencia", () => {
  it("persiste un clientMessageId nuevo junto al mensaje del user", async () => {
    streamMock.mockReturnValue(anthropicStream(["Listo"], { in: 20, out: 5 }));

    const res = await post({
      content: "buenas",
      model: "sonnet",
      clientMessageId: "client-message-001",
    });
    await res.text();

    const userCreate = db.message.create.mock.calls.find(
      (c) => (c[0] as { data: { role: string } }).data.role === "user",
    );
    expect(userCreate?.[0]).toEqual({
      data: {
        conversationId: "conv-1",
        role: "user",
        content: "buenas",
        clientMessageId: "client-message-001",
      },
    });
  });

  it("si se repite el clientMessageId ignora P2002 y vuelve a responder el stream", async () => {
    const persistedClientIds = new Set<string>();
    db.message.create.mockImplementation(
      async ({ data }: { data: { role: string; clientMessageId?: string } }) => {
        if (data.role === "user" && data.clientMessageId) {
          if (persistedClientIds.has(data.clientMessageId)) {
            throw new PrismaClientKnownRequestError("P2002");
          }
          persistedClientIds.add(data.clientMessageId);
        }
        return {};
      },
    );
    streamMock.mockImplementation(() => anthropicStream(["Listo"], { in: 20, out: 5 }));
    const body = {
      content: "buenas",
      model: "sonnet",
      clientMessageId: "client-message-duplicate",
    };

    const first = await post(body);
    await first.text();
    const retry = await post(body);
    const retryStream = await retry.text();

    expect(retry.status).toBe(200);
    expect(retryStream).toContain('"type":"delta"');
    expect(retryStream).toContain('"type":"done"');
    expect(persistedClientIds).toEqual(new Set([body.clientMessageId]));
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(
      db.message.create.mock.calls.filter(
        (c) => (c[0] as { data: { role: string } }).data.role === "assistant",
      ),
    ).toHaveLength(2);
  });

  it("al completar limpio persiste la respuesta del asistente con sus tokens", async () => {
    streamMock.mockReturnValue(anthropicStream(["Hola ", "chef"], { in: 100, out: 20 }));

    const res = await post({ content: "buenas", model: "sonnet" });
    expect(res.status).toBe(200);
    const body = await res.text(); // drena el SSE → corre el finally del stream
    expect(body).toContain('"type":"delta"');
    expect(body).toContain('"type":"done"');

    const a = assistantCreate();
    expect(a).toBeDefined();
    const data = (a![0] as { data: Record<string, unknown> }).data;
    expect(data.content).toBe("Hola chef");
    expect(data.inputTokens).toBe(100);
    expect(data.outputTokens).toBe(20);
    // Con clave del server, suma los tokens al contador diario.
    expect(quota.recordAiTokens).toHaveBeenCalledWith("u1", 100, 20);
  });

  it("si se corta a mitad (abort) NO persiste la respuesta parcial", async () => {
    streamMock.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "parcial" } };
        throw new anthro.APIUserAbortError("client aborted");
      },
      finalMessage: async () => ({ usage: {} }),
    });

    const res = await post({ content: "buenas", model: "sonnet" });
    await res.text();

    expect(assistantCreate()).toBeUndefined(); // solo se persistió el mensaje del user
    expect(quota.recordAiTokens).not.toHaveBeenCalled();
  });

  it("con el tope diario agotado responde 429 y no persiste nada", async () => {
    quota.reserveAiCall.mockResolvedValue({ ok: false, retryAfter: 3600, limit: 120 });

    const res = await post({ content: "buenas", model: "sonnet" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("ai_daily_limit");
    expect(db.message.create).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
  });
});

describe("POST chat — payload del modelo", () => {
  const payload = () => streamMock.mock.calls[0]?.[0] as {
    model: string;
    max_tokens: number;
    messages: { role: string; content: unknown }[];
  };

  it("manda el hilo con breakpoint de caché en el último mensaje", async () => {
    db.message.findMany.mockResolvedValue([
      // La ruta pide desc y revierte: el más nuevo va primero acá.
      { role: "user", content: "y sin lácteos?" },
      { role: "assistant", content: "probá con jengibre" },
      { role: "user", content: "una crema de calabaza" },
    ]);
    streamMock.mockReturnValue(anthropicStream(["ok"], { in: 10, out: 2 }));

    await (await post({ content: "y sin lácteos?", model: "sonnet" })).text();

    const { messages } = payload();
    expect(messages.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "text", text: "y sin lácteos?", cache_control: { type: "ephemeral" } },
      ],
    });
    // Los anteriores viajan planos: un solo breakpoint, el prefijo es acumulativo.
    expect(messages.slice(0, -1).map((m) => m.content)).toEqual([
      "una crema de calabaza",
      "probá con jengibre",
    ]);
  });

  it("le da a Opus presupuesto para pensar + responder sin cortarse", async () => {
    streamMock.mockReturnValue(anthropicStream(["ok"], { in: 10, out: 2 }));

    await (await post({ content: "buenas", model: "opus" })).text();

    // Opus 5 piensa por defecto y max_tokens cubre pensamiento + texto.
    expect(payload().max_tokens).toBeGreaterThan(4096);
  });

  it("sonnet y haiku se quedan en el presupuesto de chat", async () => {
    streamMock.mockReturnValue(anthropicStream(["ok"], { in: 10, out: 2 }));

    await (await post({ content: "buenas", model: "haiku" })).text();

    expect(payload().max_tokens).toBe(4096);
  });
});
