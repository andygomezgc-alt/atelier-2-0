import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Mocks elevados (el factory de vi.mock se iza sobre los consts).
const { db, guard, quota, anthro, streamMock, memoryChat, buildSystem, PrismaClientKnownRequestError } = vi.hoisted(() => {
  const db = {
    conversation: { findUnique: vi.fn(), updateMany: vi.fn() },
    message: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
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
    memoryChat: vi.fn(),
    buildSystem: vi.fn(() => [{ type: "text", text: "sys" }]),
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
vi.mock("@/lib/culinary-memory/service", () => ({ chatMemory: memoryChat }));
// buildSystemBlocks queda stubbeado (lee el .md del disco), pero
// buildMessageBlocks corre de verdad: así el test comprueba que el breakpoint
// de caché llega al payload y no solo que la ruta llama a un stub.
vi.mock("@/lib/anthropic", async () => {
  const actual = await vi.importActual<typeof import("@/lib/anthropic")>("@/lib/anthropic");
  return {
    buildSystemBlocks: buildSystem,
    buildMessageBlocks: actual.buildMessageBlocks,
    MODEL_IDS: { haiku: "h", sonnet: "s", opus: "o" },
  };
});
vi.mock("@/lib/ai/chat", () => ({ streamChat: streamMock }));
afterEach(() => vi.unstubAllEnvs());


import * as route from "../route";

async function* providerStream(deltas: string[], usage: { in: number; out: number }, incomplete = false) {
  for (const text of deltas) yield { type: "delta", text };
  yield { type: "usage", usage: { inputTokens: usage.in, outputTokens: usage.out, cachedTokens: 0, reasoningTokens: 0 } };
  if (incomplete) throw new Error("chat_response_incomplete");
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
  vi.stubEnv("GEMINI_API_KEY", "test-gemini");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
  const stored: Array<Record<string, any>> = [];
  db.conversation.updateMany.mockReset().mockResolvedValue({ count: 1 });
  db.$transaction.mockReset().mockImplementation(async cb => cb(db));
  db.conversation.findUnique.mockReset();
  db.message.create.mockReset().mockImplementation(async ({ data }) => {
    const row = { ...data, id: `message-${stored.length}` };
    stored.push(row);
    return row;
  });
  db.message.findUnique.mockReset().mockImplementation(async ({ where }) => {
    if (where.responseToId) return stored.find(row => row.responseToId === where.responseToId) ?? null;
    return stored.find(row => row.conversationId === where.conversationId_clientMessageId.conversationId && row.clientMessageId === where.conversationId_clientMessageId.clientMessageId) ?? null;
  });
  db.message.findFirst.mockReset().mockImplementation(async () => stored.at(-1) ?? null);
  db.message.findMany.mockReset().mockResolvedValue([]);
  db.restaurant.findUnique.mockReset().mockResolvedValue({ name: "Kokoo", identityLine: null });
  db.recipe.findMany.mockReset().mockResolvedValue([]);
  memoryChat.mockReset().mockResolvedValue(null);
  buildSystem.mockClear();
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
  it("retries a failed assistant save without duplicating the user's message", async () => {
    const create = db.message.create.getMockImplementation()!;
    let fail = true;
    db.message.create.mockImplementation(async args => {
      if (args.data.role === "assistant" && fail) { fail = false; throw new Error("temporary write failure"); }
      return create(args);
    });
    streamMock.mockImplementation(() => providerStream(["Recipe"], { in: 20, out: 5 }));
    const body = { content: "recipe", clientMessageId: "retry-failed-save" };
    expect(await (await post(body)).text()).toContain('"type":"error"');
    expect(await (await post(body)).text()).toContain('"type":"done"');
    expect(db.message.create.mock.calls.filter(([args]) => args.data.role === "user")).toHaveLength(1);
  });
  it("does not answer a different newer turn when retrying an old unanswered message", async () => {
    db.message.findUnique.mockResolvedValueOnce({ id: "old-user", role: "user", content: "old" }).mockResolvedValueOnce(null);
    db.message.findFirst.mockResolvedValueOnce({ id: "newer-user" });
    expect((await post({ content: "old", clientMessageId: "old-request" })).status).toBe(409);
    expect(streamMock).not.toHaveBeenCalled();
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
  });
  it.each(["sous_chef", "viewer"] as const)("el Creativo está cerrado para %s", async (role) => {
    guard.requireAuth.mockResolvedValue({ userId: "u1", restaurantId: "r1", role });
    const res = await post({ content: "idea", model: "creative" });
    expect(res.status).toBe(403);
    expect(JSON.parse(await res.text()).code).toBe("forbidden");
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("el Diario sigue abierto al sous-chef", async () => {
    guard.requireAuth.mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "sous_chef" });
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    const res = await post({ content: "idea", model: "daily" });
    expect(res.status).toBe(200);
    await res.text();
    expect(streamMock).toHaveBeenCalled();
  });

  it("a restaurant viewer cannot bypass chat permission through preview", async () => {
    guard.requireAuth.mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "viewer" });
    expect((await post({ content: "recipe" }, "preview")).status).toBe(403);
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
  });
  it("no anuncia done si falla la persistencia de la respuesta", async () => {
    db.message.create.mockImplementation(async ({ data }) => {
      if (data.role === "assistant") throw new Error("database unavailable");
      return { id: "user-message" };
    });
    streamMock.mockReturnValue(providerStream(["Receta"], { in: 20, out: 5 }));
    const response = await post({ content: "receta", clientMessageId: "persist-failure" });
    const wire = await response.text();
    expect(wire).not.toContain('"type":"done"');
    expect(wire).toContain('"type":"error"');
  });

  it("no da por completa una respuesta cortada por el límite de tokens", async () => {
    streamMock.mockReturnValue(providerStream(["Receta incompleta"], { in: 20, out: 4096 }, true));
    const response = await post({ content: "receta", clientMessageId: "truncated" });
    const wire = await response.text();
    expect(wire).not.toContain('"type":"done"');
    expect(wire).toContain('"type":"error"');
    expect(assistantCreate()).toBeUndefined();
  });
  it("persiste un clientMessageId nuevo junto al mensaje del user", async () => {
    streamMock.mockReturnValue(providerStream(["Listo"], { in: 20, out: 5 }));

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

  it("replays an already saved response without another model call or quota reservation", async () => {
    streamMock.mockImplementation(() => providerStream(["Listo"], { in: 20, out: 5 }));
    const body = { content: "buenas", model: "sonnet", clientMessageId: "retry-id" };
    await (await post(body)).text();
    const retry = await post(body);
    expect(await retry.text()).toContain('"replayed":true');
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(db.message.create.mock.calls.filter(([arg]) => arg.data.role === "assistant")).toHaveLength(1);
  });

  it("rejects simultaneous turns before calling the model or reserving quota", async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 0 });
    expect((await post({ content: "hello", clientMessageId: "busy-turn-id" })).status).toBe(409);
    expect(streamMock).not.toHaveBeenCalled();
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
  });

  it("rejects reuse of a request identifier with different content", async () => {
    streamMock.mockImplementation(() => providerStream(["Listo"], { in: 20, out: 5 }));
    await (await post({ content: "one", clientMessageId: "same-turn-id" })).text();
    expect((await post({ content: "two", clientMessageId: "same-turn-id" })).status).toBe(409);
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it("an expired worker cannot commit over a newer generation", async () => {
    db.conversation.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 });
    streamMock.mockReturnValue(providerStream(["old response"], { in: 20, out: 5 }));
    const wire = await (await post({ content: "hello" })).text();
    expect(wire).toContain('"type":"error"');
    expect(wire).not.toContain('"type":"done"');
    expect(assistantCreate()).toBeUndefined();
  });

  it("al completar limpio persiste la respuesta del asistente con sus tokens", async () => {
    streamMock.mockReturnValue(providerStream(["Hola ", "chef"], { in: 100, out: 20 }));

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
        yield { type: "delta", text: "parcial" };
        throw new anthro.APIUserAbortError("client aborted");
      },
      finalMessage: async () => ({ usage: {} }),
    });

    const res = await post({ content: "buenas", model: "sonnet" });
    await res.text();

    expect(assistantCreate()).toBeUndefined(); // solo se persistió el mensaje del user
    expect(quota.recordAiTokens).not.toHaveBeenCalled();
  });

  it.each(["conv-1", "preview"])("%s chat is not blocked by the old 120/day technical quota", async id => {
    quota.reserveAiCall.mockResolvedValue({ ok: false, retryAfter: 3600, limit: 120 });
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    const res = await post({ content: "buenas", model: "daily" }, id);
    expect(await res.text()).toContain('"type":"done"');
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledWith(expect.objectContaining({ model: "daily", userId: "u1" }));
  });

  it.each(["conv-1", "preview"])("%s forwards the weekly denial and keeps the chat retryable", async id => {
    streamMock.mockImplementation(async function* () { throw new Error("ai_daily_weekly_limit"); });
    const res = await post({ content: "receta", model: "daily" }, id);
    const wire = await res.text();
    expect(wire).toContain('"type":"error","message":"ai_daily_weekly_limit"');
    expect(wire).not.toContain('"type":"done"');
    expect(assistantCreate()).toBeUndefined();
    if (id !== "preview") expect(db.conversation.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { generationId: null, generationStartedAt: null } }));
  });
});

describe("POST chat — selección de proveedor", () => {
  it("avoids loading or adding recent titles when useful memory is ready", async () => {
    memoryChat.mockResolvedValue("Técnicas de brasa");
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    await (await post({ content: "receta" })).text();
    expect(db.recipe.findMany).not.toHaveBeenCalled();
    expect(buildSystem).toHaveBeenCalledWith(expect.anything(), [], null, "Técnicas de brasa");
  });

  it.each([
    ["empty", "resolve"],
    ["failure", "reject"],
  ])("falls back to recent titles when memory is %s", async (_label, outcome) => {
    db.recipe.findMany.mockResolvedValue([{ title: "Receta reciente", state: "approved" }]);
    if (outcome === "reject") memoryChat.mockRejectedValue(new Error("database unavailable"));
    else memoryChat.mockResolvedValue("");
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    await (await post({ content: "receta" })).text();
    expect(db.recipe.findMany).toHaveBeenCalledTimes(1);
    expect(buildSystem).toHaveBeenCalledWith(expect.anything(), [{ title: "Receta reciente", state: "approved" }], null, null);
  });

  it.each([["daily", "gemini-3.8-flash"], ["sonnet", "gemini-3.8-flash"], ["haiku", "gemini-3.8-flash"], ["creative", "claude-opus-5"], ["opus", "claude-opus-5"]])("%s conserva el modelo real en la conversación", async (model, expected) => {
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    expect(await (await post({ content: "receta", model })).text()).toContain('"type":"done"');
    expect(streamMock.mock.calls[0]![0].model).toBe(model);
    expect(assistantCreate()?.[0].data.modelId).toBe(expected);
  });
  it("usa Diario por defecto sin reservar una segunda llamada", async () => {
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    await (await post({ content: "receta" })).text();
    expect(streamMock.mock.calls[0]![0].model).toBe("daily");
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
  });
  it("falta de clave no consume cuota ni persiste un turno", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await post({ content: "receta", model: "daily" });
    expect(res.status).toBe(503);
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
  });
});
