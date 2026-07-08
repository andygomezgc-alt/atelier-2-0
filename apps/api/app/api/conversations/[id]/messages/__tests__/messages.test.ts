import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Mocks elevados (el factory de vi.mock se iza sobre los consts).
const { db, guard, quota, byok, anthro, streamMock } = vi.hoisted(() => {
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
  const byok = { loadUserBYOK: vi.fn(async () => null) };
  const streamMock = vi.fn();
  class Anthropic {
    messages = { stream: streamMock };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_opts: unknown) {}
  }
  class APIUserAbortError extends Error {}
  return { db, guard, quota, byok, anthro: { Anthropic, APIUserAbortError }, streamMock };
});

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/ai-quota", () => ({
  reserveAiCall: quota.reserveAiCall,
  recordAiTokens: quota.recordAiTokens,
  aiQuotaExceededResponse: quota.aiQuotaExceededResponse,
}));
vi.mock("@/lib/byok-user", () => ({ loadUserBYOK: byok.loadUserBYOK }));
vi.mock("@/lib/byok-providers", () => ({ streamBYOK: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  buildSystemBlocks: () => [{ type: "text", text: "sys" }],
  MODEL_IDS: { haiku: "h", sonnet: "s", opus: "o" },
}));
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
  byok.loadUserBYOK.mockReset().mockResolvedValue(null);
  streamMock.mockReset();
  db.conversation.findUnique.mockResolvedValue({
    id: "conv-1",
    restaurantId: "r1",
    idea: { text: null },
  });
});

describe("POST chat — persistencia", () => {
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
