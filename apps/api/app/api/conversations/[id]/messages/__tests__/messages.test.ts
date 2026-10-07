import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { can, type Permission } from "@atelier/shared";
import { ApiErrorCodeSchema } from "@atelier/shared";
import { AiBudgetError, textInputCeiling } from "@/lib/ai/budget-policy";
import type { Reservation } from "@/lib/ai/budget";
import type { Msg } from "@/lib/anthropic";
import { logger } from "@/lib/logger";
import { inspect } from "node:util";

// Mocks elevados (el factory de vi.mock se iza sobre los consts).
const { db, guard, authContext, quota, budget, anthro, streamMock, memoryChat, buildSystem, historyWindow, afterMock, PrismaClientKnownRequestError } = vi.hoisted(() => {
  const db = {
    conversation: { findUnique: vi.fn(), updateMany: vi.fn() },
    message: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
    restaurant: { findUnique: vi.fn() },
    recipe: { findMany: vi.fn() },
    chefNote: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  const authContext = {
    userId: "u1", restaurantId: "r1" as string | null,
    role: "chef_executive" as Parameters<typeof can>[0],
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
    authContext,
    quota,
    budget: {
      reserveGeneration: vi.fn(), releaseGeneration: vi.fn(),
      settleGeneration: vi.fn(), settleInterruptedGeneration: vi.fn(),
    },
    anthro: { Anthropic, APIUserAbortError },
    streamMock,
    memoryChat: vi.fn(),
    buildSystem: vi.fn(() => [{ type: "text", text: "sys" }]),
    historyWindow: vi.fn(), afterMock: vi.fn(),
    PrismaClientKnownRequestError,
  };
});

vi.mock("next/server", async importOriginal => ({
  ...(await importOriginal<typeof import("next/server")>()), after: afterMock,
}));
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
vi.mock("@/lib/ai/budget", () => budget);
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
vi.mock("@/lib/ai/chat", async () => {
  // Keep history validation and typed errors real; only the provider is stubbed.
  const actual = await vi.importActual<typeof import("@/lib/ai/chat")>("@/lib/ai/chat");
  return { ...actual, streamChat: streamMock, stableHistoryWindow: historyWindow };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });


import * as route from "../route";

const reservation: Reservation = {
  id: "prepared-reservation", budgetId: "pilot", micros: 100_000,
  rate: { input: .75, output: 3.75, cached: .075, cacheWrite: .75 },
};

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

function expectReleasedLease() {
  const claim = db.conversation.updateMany.mock.calls.filter(([args]) => typeof args.data.generationId === "string").at(-1);
  expect(claim).toBeDefined();
  expect(db.conversation.updateMany).toHaveBeenLastCalledWith({
    where: { id: "conv-1", generationId: claim![0].data.generationId },
    data: { generationId: null, generationStartedAt: null },
  });
}

beforeEach(async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
  const stored: Array<Record<string, any>> = [];
  let generationId: string | null = null;
  db.conversation.updateMany.mockReset().mockImplementation(async ({ data }) => {
    generationId = data.generationId;
    return { count: 1 };
  });
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
  db.message.findMany.mockReset().mockResolvedValue([{ role: "user", content: "buenas" }]);
  db.message.count.mockReset().mockResolvedValue(1);
  db.restaurant.findUnique.mockReset().mockResolvedValue({ name: "Kokoo", identityLine: null });
  db.recipe.findMany.mockReset().mockResolvedValue([]);
  db.chefNote.findMany.mockReset().mockResolvedValue([]);
  db.user.findUnique.mockReset().mockResolvedValue({ languagePref: "es" });
  memoryChat.mockReset().mockResolvedValue(null);
  buildSystem.mockReset().mockReturnValue([{ type: "text", text: "sys" }]);
  // restoreAllMocks clears implementations installed after vi.fn() creation.
  const actualChat = await vi.importActual<typeof import("@/lib/ai/chat")>("@/lib/ai/chat");
  historyWindow.mockReset().mockImplementation(actualChat.stableHistoryWindow);
  afterMock.mockReset().mockImplementation((task: Promise<unknown> | (() => unknown)) => {
    void Promise.resolve().then(() => typeof task === "function" ? task() : task).catch(() => undefined);
  });
  authContext.restaurantId = "r1";
  authContext.role = "chef_executive";
  guard.requireAuth.mockReset().mockImplementation(async (_req: NextRequest, permission?: Permission) => {
    if (permission && !authContext.restaurantId)
      return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
    if (permission && !can(authContext.role, permission))
      return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    return { ...authContext };
  });
  quota.reserveAiCall.mockReset().mockResolvedValue({ ok: true, used: 1, limit: 120 });
  quota.recordAiTokens.mockClear();
  budget.reserveGeneration.mockReset().mockResolvedValue(reservation);
  budget.releaseGeneration.mockReset().mockResolvedValue(undefined);
  budget.settleGeneration.mockReset().mockResolvedValue(undefined);
  budget.settleInterruptedGeneration.mockReset().mockResolvedValue(undefined);
  streamMock.mockReset();
  db.conversation.findUnique.mockImplementation(async () => ({
    id: "conv-1",
    restaurantId: "r1",
    authorId: "u1", generationId,
    idea: { text: null },
  }));
});

describe("GET chat permissions", () => {
  it("rejects a viewer reading restaurant transcripts before querying chat", async () => {
    authContext.role = "viewer";
    db.message.findMany.mockResolvedValue([]);
    const res = await route.GET(new NextRequest("https://t.local/api/conversations/conv-1/messages"), { params: Promise.resolve({ id: "conv-1" }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden", code: "forbidden" });
    expect(db.conversation.findUnique).not.toHaveBeenCalled();
    expect(db.message.findMany).not.toHaveBeenCalled();
  });

  it("lets a sous-chef read restaurant transcripts", async () => {
    authContext.role = "sous_chef";
    db.message.findMany.mockResolvedValue([{ id: "m1", role: "user", content: "recipe", clientMessageId: null, createdAt: new Date("2026-10-06T10:00:00Z") }]);
    const res = await route.GET(new NextRequest("https://t.local/api/conversations/conv-1/messages"), { params: Promise.resolve({ id: "conv-1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "m1", role: "user", content: "recipe", clientMessageId: null, createdAt: "2026-10-06T10:00:00.000Z" }]);
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
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
  });
  it.each(["sous_chef", "viewer"] as const)("el Creativo está cerrado para %s", async (role) => {
    authContext.role = role;
    const res = await post({ content: "idea", model: "creative" });
    expect(res.status).toBe(403);
    expect(JSON.parse(await res.text()).code).toBe("forbidden");
    expect(streamMock).not.toHaveBeenCalled();
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("el Diario sigue abierto al sous-chef", async () => {
    authContext.role = "sous_chef";
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    const res = await post({ content: "idea", model: "daily" });
    expect(res.status).toBe(200);
    await res.text();
    expect(streamMock).toHaveBeenCalled();
  });

  it("a restaurant viewer cannot send normal chat messages", async () => {
    authContext.role = "viewer";
    const res = await post({ content: "recipe" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden", code: "forbidden" });
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("a viewer without a restaurant can still use preview chat", async () => {
    authContext.role = "viewer";
    authContext.restaurantId = null;
    streamMock.mockReturnValue(providerStream(["Recipe"], { in: 10, out: 20 }));
    const res = await post({ content: "recipe", history: [] }, "preview");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"type":"done"');
    expect(db.conversation.findUnique).not.toHaveBeenCalled();
  });

  it("a restaurant viewer cannot bypass chat permission through preview", async () => {
    authContext.role = "viewer";
    expect((await post({ content: "recipe" }, "preview")).status).toBe(403);
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
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
    budget.reserveGeneration.mockClear().mockRejectedValue(new AiBudgetError("ai_budget_exhausted"));
    db.restaurant.findUnique.mockClear();
    const retry = await post(body);
    const wire = await retry.text();
    expect(retry.status).toBe(200);
    expect(wire).toContain('"type":"delta","text":"Listo"');
    expect(wire).toContain('"replayed":true');
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(budget.releaseGeneration).not.toHaveBeenCalled();
    expect(db.restaurant.findUnique).not.toHaveBeenCalled();
    expect(db.message.create.mock.calls.filter(([arg]) => arg.data.role === "user")).toHaveLength(1);
    expect(db.message.create.mock.calls.filter(([arg]) => arg.data.role === "assistant")).toHaveLength(1);
    expectReleasedLease();
  });

  it("rejects simultaneous turns before calling the model or reserving quota", async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 0 });
    expect((await post({ content: "hello", clientMessageId: "busy-turn-id" })).status).toBe(409);
    expect(streamMock).not.toHaveBeenCalled();
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of a request identifier with different content", async () => {
    streamMock.mockImplementation(() => providerStream(["Listo"], { in: 20, out: 5 }));
    await (await post({ content: "one", clientMessageId: "same-turn-id" })).text();
    budget.reserveGeneration.mockClear();
    expect((await post({ content: "two", clientMessageId: "same-turn-id" })).status).toBe(409);
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
  });

  it("an expired worker cannot commit over a newer generation", async () => {
    db.conversation.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 });
    streamMock.mockReturnValue(providerStream(["old response"], { in: 20, out: 5 }));
    const wire = await (await post({ content: "hello" })).text();
    expect(wire).toContain('"type":"stopped"');
    expect(wire).not.toContain('"type":"error"');
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

  it("does not persist a partial response when the provider itself aborts", async () => {
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

  it.each(["conv-1", "preview"])("%s returns a weekly denial as HTTP and lets the same request retry later", async id => {
    budget.reserveGeneration.mockRejectedValueOnce(new AiBudgetError("ai_daily_weekly_limit", 3600));
    streamMock.mockImplementation(() => providerStream(["Lista"], { in: 10, out: 20 }));
    const request = { content: "receta", model: "daily", clientMessageId: "weekly-retry-id" };
    const res = await post(request, id);
    const wire = await res.text();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(JSON.parse(wire)).toEqual({ error: "ai_daily_weekly_limit", code: "ai_daily_weekly_limit" });
    expect(streamMock).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
    if (id !== "preview") expectReleasedLease();
    const retry = await post(request, id);
    expect(retry.status).toBe(200);
    expect(await retry.text()).toContain('"type":"done"');
    expect(budget.reserveGeneration).toHaveBeenCalledTimes(2);
    expect(db.message.create.mock.calls.filter(([args]) => args.data.role === "user")).toHaveLength(id === "preview" ? 0 : 1);
  });

  it("turns a provider refusal into readable text for installed apps", async () => {
    streamMock.mockImplementation(async function* () { throw new Error("chat_refused"); });
    const wire = await (await post({ content: "receta", model: "creative" })).text();
    expect(wire).toContain('"code":"chat_refused"');
    expect(wire).toContain("El Creativo no puede responder a esta consulta. Reformúlala o pruébala en el Diario.");
    expect(wire).not.toContain('"type":"done"');
    expect(assistantCreate()).toBeUndefined();
  });
});

describe("A5 pre-stream preparation", () => {
  const refusals = [
    { code: "ai_budget_exhausted", status: 429, model: "daily" },
    { code: "ai_budget_expired", status: 429, model: "daily" },
    { code: "ai_budget_unavailable", status: 503, model: "daily" },
    { code: "ai_daily_weekly_limit", status: 429, model: "daily" },
    { code: "ai_creative_limit", status: 429, model: "creative" },
  ] as const;

  it.each(refusals.flatMap(refusal => ["conv-1", "preview"].map(id => ({ ...refusal, id }))))(
    "$id returns $code as HTTP $status before saving or streaming",
    async ({ code, status, model, id }) => {
      const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
      budget.reserveGeneration.mockRejectedValueOnce(new AiBudgetError(code, 123));
      streamMock.mockReturnValue(providerStream(["Must not start"], { in: 10, out: 20 }));
      const res = await post({ content: "secret chef prompt", model, clientMessageId: "denied-turn-id" }, id);
      const wire = await res.text(); // Drain a mistaken 200 too, so RED cannot leak a heartbeat.

      expect(res.status).toBe(status);
      expect(res.headers.get("Content-Type")).toContain("application/json");
      expect(res.headers.get("Retry-After")).toBe("123");
      expect(JSON.parse(wire)).toEqual({ error: code, code });
      expect(wire).not.toContain("secret chef prompt");
      expect(budget.reserveGeneration).toHaveBeenCalledTimes(1);
      const messages: Msg[] = [
        ...(id === "conv-1" ? [{ role: "user" as const, content: "buenas" }] : []),
        { role: "user", content: "secret chef prompt" },
      ];
      expect(budget.reserveGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: model }),
        textInputCeiling({ system: [{ type: "text", text: "sys" }], messages }), "u1");
      expect(db.message.create).not.toHaveBeenCalled();
      expect(streamMock).not.toHaveBeenCalled();
      expect(buildSystem).toHaveBeenCalledTimes(1);
      expect(buildSystem.mock.invocationCallOrder[0]).toBeLessThan(budget.reserveGeneration.mock.invocationCallOrder[0]!);
      expect(budget.releaseGeneration).not.toHaveBeenCalled(); // No successful reservation to refund.
      expect(budget.settleGeneration).not.toHaveBeenCalled();
      expect(budget.settleInterruptedGeneration).not.toHaveBeenCalled();
      expect(quota.recordAiTokens).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
      if (id === "conv-1") {
        expect(db.restaurant.findUnique).toHaveBeenCalledTimes(1);
        expect(db.message.findMany).toHaveBeenCalledTimes(1);
        expect(db.message.count).toHaveBeenCalledTimes(1);
        expect(db.recipe.findMany).toHaveBeenCalledTimes(1);
        expect(db.chefNote.findMany).toHaveBeenCalledTimes(1);
        expect(memoryChat).toHaveBeenCalledTimes(1);
        expect(db.conversation.updateMany.mock.invocationCallOrder[0]).toBeLessThan(budget.reserveGeneration.mock.invocationCallOrder[0]!);
        expectReleasedLease();
      } else {
        expect(db.restaurant.findUnique).not.toHaveBeenCalled();
        expect(db.message.findMany).not.toHaveBeenCalled();
        expect(db.message.count).not.toHaveBeenCalled();
        expect(db.recipe.findMany).not.toHaveBeenCalled();
        expect(db.chefNote.findMany).not.toHaveBeenCalled();
        expect(memoryChat).not.toHaveBeenCalled();
        expect(db.conversation.findUnique).not.toHaveBeenCalled();
        expect(db.conversation.updateMany).not.toHaveBeenCalled();
      }
    },
  );

  it("locks, checks for replay, prepares context, reserves its payload, saves, then streams and links the answer", async () => {
    const existing: Msg[] = [{ role: "user", content: "previous question" }, { role: "assistant", content: "previous answer" }];
    db.message.findMany.mockResolvedValue([...existing].reverse());
    db.message.count.mockResolvedValue(existing.length);
    streamMock.mockReturnValue(providerStream(["Hola ", "chef"], { in: 100, out: 20 }));
    const res = await post({ content: "buenas", model: "daily", clientMessageId: "prepared-turn-id", userId: "untrusted-user" });
    const wire = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(wire).toContain('"type":"delta","text":"Hola "');
    expect(wire).toContain('"type":"done"');
    expect(wire).not.toContain('"type":"error"');
    expect(budget.reserveGeneration).toHaveBeenCalledTimes(1);
    const messages: Msg[] = [...existing, { role: "user", content: "buenas" }];
    expect(budget.reserveGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: "daily", model: "gemini-3.8-flash", maxTokens: 8192 }),
      textInputCeiling({ system: [{ type: "text", text: "sys" }], messages }), "u1");
    const order = [
      db.conversation.updateMany.mock.invocationCallOrder[0],
      db.message.findUnique.mock.invocationCallOrder[0],
      db.restaurant.findUnique.mock.invocationCallOrder[0],
      buildSystem.mock.invocationCallOrder[0],
      budget.reserveGeneration.mock.invocationCallOrder[0],
      db.message.create.mock.invocationCallOrder[0],
      streamMock.mock.invocationCallOrder[0],
    ];
    expect(order.every(value => typeof value === "number")).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
    for (const query of [db.restaurant.findUnique, db.message.findMany, db.message.count, db.recipe.findMany, db.chefNote.findMany, memoryChat]) {
      expect(query.mock.invocationCallOrder[0]).toBeGreaterThan(db.message.findUnique.mock.invocationCallOrder[0]!);
      expect(query.mock.invocationCallOrder[0]).toBeLessThan(buildSystem.mock.invocationCallOrder[0]!);
    }
    expect(streamMock.mock.calls[0]![0].messages).toEqual(messages);
    expect(db.message.create).toHaveBeenCalledTimes(2);
    expect(db.message.create).toHaveBeenNthCalledWith(1, { data: {
      conversationId: "conv-1", role: "user", content: "buenas", clientMessageId: "prepared-turn-id",
    } });
    expect(assistantCreate()?.[0].data).toMatchObject({
      role: "assistant", content: "Hola chef", responseToId: "message-0", modelId: "gemini-3.8-flash",
      inputTokens: 100, outputTokens: 20, cachedTokens: 0,
    });
    expect(streamMock.mock.calls[0]![0].reservation).toBe(reservation);
    expect(budget.releaseGeneration).not.toHaveBeenCalled(); // The adapter owns A4 billing once it starts.
    expect(quota.recordAiTokens).toHaveBeenCalledWith("u1", 100, 20);
    expectReleasedLease();
  });

  it.each(["conv-1", "preview"].flatMap(id => ["daily", "creative"].map(model => ({ id, model }))))(
    "$id reserves $model using exactly the system and messages sent to the provider",
    async ({ id, model }) => {
      const existing: Msg[] = [{ role: "user", content: "Crème de limón 🍋" }, { role: "assistant", content: "Sin lácteos\nCon aceite" }];
      const content = "Asar berenjena 🥬\nSin gluten";
      const system = [{ type: "text", text: `Cuisine ${model}: brasa 🥬\nChef notes and memory` }];
      db.message.findMany.mockResolvedValue([...existing].reverse());
      db.message.count.mockResolvedValue(existing.length);
      buildSystem.mockReturnValue(system);
      streamMock.mockReturnValue(providerStream(["Recipe"], { in: 10, out: 20 }));
      const res = await post({ content, model, history: existing, clientMessageId: "payload-ceiling-id" }, id);
      const wire = await res.text();
      expect(res.status).toBe(200);
      expect(wire).toContain('"type":"done"');
      expect(streamMock).toHaveBeenCalledTimes(1);
      const sent = streamMock.mock.calls[0]![0];
      expect(sent.system).toEqual(system);
      expect(sent.messages).toEqual([...existing, { role: "user", content }]);
      expect(sent.reservation).toBe(reservation);
      expect(budget.reserveGeneration).toHaveBeenCalledTimes(1);
      expect(budget.reserveGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: model }),
        textInputCeiling({ system: sent.system, messages: sent.messages }), "u1");
      expect(buildSystem.mock.invocationCallOrder[0]).toBeLessThan(budget.reserveGeneration.mock.invocationCallOrder[0]!);
      if (id === "conv-1") {
        expect(budget.reserveGeneration.mock.invocationCallOrder[0]).toBeLessThan(db.message.create.mock.invocationCallOrder[0]!);
      } else expect(db.message.create).not.toHaveBeenCalled();
    },
  );

  it("reserves for an unanswered retry without creating another user message", async () => {
    db.message.findUnique.mockResolvedValueOnce({ id: "prior-user", role: "user", content: "buenas" }).mockResolvedValueOnce(null);
    db.message.findFirst.mockResolvedValueOnce({ id: "prior-user" });
    streamMock.mockReturnValue(providerStream(["Recipe"], { in: 10, out: 20 }));
    const res = await post({ content: "buenas", clientMessageId: "unanswered-id" });
    expect(await res.text()).toContain('"type":"done"');
    expect(res.status).toBe(200);
    expect(budget.reserveGeneration).toHaveBeenCalledTimes(1);
    expect(db.message.findUnique.mock.invocationCallOrder[1]).toBeLessThan(budget.reserveGeneration.mock.invocationCallOrder[0]!);
    expect(db.message.findFirst.mock.invocationCallOrder[0]).toBeLessThan(budget.reserveGeneration.mock.invocationCallOrder[0]!);
    expect(db.message.create).toHaveBeenCalledTimes(1);
    expect(assistantCreate()?.[0].data).toMatchObject({ content: "Recipe", responseToId: "prior-user" });
    expect(streamMock.mock.calls[0]![0].reservation).toBe(reservation);
    expect(streamMock.mock.calls[0]![0].messages).toEqual([{ role: "user", content: "buenas" }]);
    expect(budget.reserveGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: "daily" }),
      textInputCeiling({ system: [{ type: "text", text: "sys" }], messages: [{ role: "user", content: "buenas" }] }), "u1");
    expectReleasedLease();
  });

  it("appends a new turn in memory even when its content matches the previous user message", async () => {
    streamMock.mockReturnValue(providerStream(["Recipe"], { in: 10, out: 20 }));
    const res = await post({ content: "buenas", clientMessageId: "new-repeated-question" });
    expect(await res.text()).toContain('"type":"done"');
    const messages: Msg[] = [{ role: "user", content: "buenas" }, { role: "user", content: "buenas" }];
    expect(streamMock.mock.calls[0]![0].messages).toEqual(messages);
    expect(budget.reserveGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: "daily" }),
      textInputCeiling({ system: [{ type: "text", text: "sys" }], messages }), "u1");
    expect(db.message.create.mock.calls.filter(([args]) => args.data.role === "user")).toHaveLength(1);
  });

  it("denies an unanswered retry without inserting another message or calling the provider", async () => {
    db.message.findUnique.mockResolvedValueOnce({ id: "prior-user", role: "user", content: "buenas" }).mockResolvedValueOnce(null);
    db.message.findFirst.mockResolvedValueOnce({ id: "prior-user" });
    budget.reserveGeneration.mockRejectedValueOnce(new AiBudgetError("ai_budget_exhausted", 60));
    streamMock.mockReturnValue(providerStream(["Must not start"], { in: 10, out: 20 }));
    const res = await post({ content: "buenas", clientMessageId: "unanswered-id" });
    const wire = await res.text();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(JSON.parse(wire)).toEqual({ error: "ai_budget_exhausted", code: "ai_budget_exhausted" });
    expect(db.message.create).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
    expectReleasedLease();
  });

  it.each(["restaurant", "history", "history count", "recipes", "chef notes", "system blocks"])(
    "releases only the lease without reserving or saving after failed %s preparation",
    async stage => {
      const error = new Error(`failed ${stage}`);
      if (stage === "restaurant") db.restaurant.findUnique.mockRejectedValueOnce(error);
      if (stage === "history") db.message.findMany.mockRejectedValueOnce(error);
      if (stage === "history count") db.message.count.mockRejectedValueOnce(error);
      if (stage === "recipes") db.recipe.findMany.mockRejectedValueOnce(error);
      if (stage === "chef notes") db.chefNote.findMany.mockRejectedValueOnce(error);
      if (stage === "system blocks") buildSystem.mockImplementationOnce(() => { throw error; });
      const outcome = await post({ content: "buenas", clientMessageId: "failed-prepare-id" }).catch(cause => cause);
      if (outcome instanceof Response) {
        await outcome.text();
        expect(outcome.status).toBeGreaterThanOrEqual(500);
        expect(outcome.headers.get("Content-Type")).not.toContain("text/event-stream");
      } else expect(outcome).toBe(error);
      expect(budget.reserveGeneration).not.toHaveBeenCalled();
      expect(budget.releaseGeneration).not.toHaveBeenCalled();
      expect(db.message.create).not.toHaveBeenCalled();
      expectReleasedLease();
      expect(streamMock).not.toHaveBeenCalled();
      expect(assistantCreate()).toBeUndefined();
      expect(budget.settleGeneration).not.toHaveBeenCalled();
      expect(budget.settleInterruptedGeneration).not.toHaveBeenCalled();
    },
  );

  it("refunds the payload-based reservation and releases the lease when saving the user message fails", async () => {
    const error = new Error("user message unavailable");
    db.message.create.mockRejectedValueOnce(error);
    const outcome = await post({ content: "new question", clientMessageId: "failed-user-write-id" }).catch(cause => cause);
    if (outcome instanceof Response) {
      await outcome.text();
      expect(outcome.status).toBeGreaterThanOrEqual(500);
      expect(outcome.headers.get("Content-Type")).not.toContain("text/event-stream");
    } else expect(outcome).toBe(error);
    expect(buildSystem).toHaveBeenCalledTimes(1);
    expect(budget.reserveGeneration).toHaveBeenCalledTimes(1);
    expect(budget.reserveGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: "daily" }), textInputCeiling({
      system: [{ type: "text", text: "sys" }],
      messages: [{ role: "user", content: "buenas" }, { role: "user", content: "new question" }],
    }), "u1");
    expect(buildSystem.mock.invocationCallOrder[0]).toBeLessThan(budget.reserveGeneration.mock.invocationCallOrder[0]!);
    expect(budget.reserveGeneration.mock.invocationCallOrder[0]).toBeLessThan(db.message.create.mock.invocationCallOrder[0]!);
    expect(budget.releaseGeneration).toHaveBeenCalledTimes(1);
    expect(budget.releaseGeneration).toHaveBeenCalledWith(reservation);
    expectReleasedLease();
    expect(streamMock).not.toHaveBeenCalled();
    expect(assistantCreate()).toBeUndefined();
    expect(budget.settleGeneration).not.toHaveBeenCalled();
    expect(budget.settleInterruptedGeneration).not.toHaveBeenCalled();
  });

  it("still releases the lease when refunding a failed preparation also fails", async () => {
    const error = new Error("user message unavailable");
    db.message.create.mockRejectedValueOnce(error);
    budget.releaseGeneration.mockRejectedValueOnce(new Error("refund unavailable"));
    const outcome = await post({ content: "buenas" }).catch(cause => cause);
    if (outcome instanceof Response) {
      await outcome.text();
      expect(outcome.status).toBeGreaterThanOrEqual(500);
    } else expect(outcome).toBe(error);
    expect(budget.reserveGeneration).toHaveBeenCalledTimes(1);
    expect(budget.releaseGeneration).toHaveBeenCalledTimes(1);
    expect(budget.releaseGeneration).toHaveBeenCalledWith(reservation);
    expectReleasedLease();
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("does not reserve or refund preview preparation when building the prompt fails", async () => {
    const error = new Error("prompt unavailable");
    buildSystem.mockImplementationOnce(() => { throw error; });
    const outcome = await post({ content: "buenas" }, "preview").catch(cause => cause);
    if (outcome instanceof Response) {
      await outcome.text();
      expect(outcome.status).toBeGreaterThanOrEqual(500);
    } else expect(outcome).toBe(error);
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(budget.releaseGeneration).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
    expect(db.conversation.updateMany).not.toHaveBeenCalled();
  });

  it.each([null, { id: "conv-1", restaurantId: "other-restaurant", idea: null }])(
    "returns 404 for a missing or foreign conversation before reserving or taking a lease",
    async conversation => {
      db.conversation.findUnique.mockResolvedValueOnce(conversation);
      expect((await post({ content: "recipe" })).status).toBe(404);
      expect(budget.reserveGeneration).not.toHaveBeenCalled();
      expect(db.conversation.updateMany).not.toHaveBeenCalled();
      expect(db.message.create).not.toHaveBeenCalled();
      expect(streamMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { role: "admin", model: "creative" },
    { role: "admin", model: "opus" },
    { role: "chef_executive", model: "creative" },
    { role: "chef_executive", model: "opus" },
  ] as const)("denies $model to $role without a restaurant", async ({ role, model }) => {
    authContext.restaurantId = null;
    authContext.role = role;
    streamMock.mockReturnValue(providerStream(["Must not start"], { in: 10, out: 20 }));
    const res = await post({ content: "recipe", model }, "preview");
    const wire = await res.text();
    expect(res.status).toBe(403);
    expect(JSON.parse(wire)).toMatchObject({ code: "forbidden" });
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
    expect(db.conversation.updateMany).not.toHaveBeenCalled();
  });

  it.each(["conv-1", "preview"])("%s rejects invalid content before reserving or taking a lease", async id => {
    expect((await post({ content: "" }, id)).status).toBe(400);
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(db.conversation.updateMany).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
  });
});

describe("POST chat — historial por bloques", () => {
  // Mensaje `i` de la conversación: pares del chef, impares del asistente.
  const stored = (i: number) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` });

  it.each([false, true])("preview bounds raw history before windowing and reserves only the sent payload (current included=%s)", async included => {
    // The accepted 40-message payload can still contain 400k discarded characters.
    const historyLength = included ? 39 : 40;
    const discardedCount = historyLength - 20;
    const history = Array.from({ length: historyLength }, (_, i) => ({
      ...stored(i), content: i < discardedCount ? `discarded-${i}`.padEnd(20_000, ".") : `m${i}`,
    }));
    const content = included ? "m38" : "m40";
    authContext.restaurantId = null;
    streamMock.mockImplementation(() => providerStream(["Recipe"], { in: 10, out: 20 }));
    const first = await post({ content, history }, "preview");
    expect(await first.text()).toContain('"type":"done"');
    const sent = streamMock.mock.calls[0]![0];
    expect(sent.messages.length).toBeLessThanOrEqual(20);
    expect(sent.messages.some((message: Msg) => message.content.startsWith("discarded-"))).toBe(false);
    expect(sent.messages.filter((message: Msg) => message.content === content)).toHaveLength(1);
    expect(budget.reserveGeneration.mock.calls[0]![1]).toBe(textInputCeiling({ system: sent.system, messages: sent.messages }));
    const ceiling = budget.reserveGeneration.mock.calls[0]![1];
    const boundedInput = historyWindow.mock.calls[0]![0] as Msg[];
    // Twenty recent raw entries plus, at most, the new user message.
    expect(boundedInput.length).toBeLessThanOrEqual(21);
    expect(boundedInput.some(message => message.content.startsWith("discarded-"))).toBe(false);
    await (await post({ content, history: history.map((message, i) => i < discardedCount ? { ...message, content: "ignored" } : message) }, "preview")).text();
    expect(streamMock.mock.calls[1]![0].messages).toEqual(sent.messages);
    expect(budget.reserveGeneration.mock.calls[1]![1]).toBe(ceiling);
  });

  it.each([
    { historyLength: 25, current: 24, first: 10 },
    { historyLength: 27, current: 26, first: 10 },
    { historyLength: 29, current: 28, first: 10 },
    { historyLength: 31, current: 30, first: 20 },
    { historyLength: 24, current: 24, first: 10 },
    { historyLength: 30, current: 30, first: 20 },
  ])("preview aligns $historyLength client messages at $first, including the current message exactly once", async ({ historyLength, current, first }) => {
    authContext.restaurantId = null;
    streamMock.mockReturnValue(providerStream(["Recipe"], { in: 10, out: 20 }));
    const res = await post({ content: `m${current}`, history: Array.from({ length: historyLength }, (_, i) => stored(i)) }, "preview");
    expect(await res.text()).toContain('"type":"done"');
    expect(res.status).toBe(200);
    const sent = streamMock.mock.calls[0]![0].messages as { role: string; content: string }[];
    expect(sent.map(message => message.content)).toEqual(Array.from({ length: current - first + 1 }, (_, i) => `m${first + i}`));
    expect(sent[0]!.role).toBe("user");
    expect(sent.filter(message => message.content === `m${current}`)).toHaveLength(1);
    expect(db.message.create).not.toHaveBeenCalled();
    expect(db.conversation.findUnique).not.toHaveBeenCalled();
  });

  it("preview advances to the next aligned block when the character budget is exceeded", async () => {
    const history = Array.from({ length: 25 }, (_, i) => ({ ...stored(i), content: `m${i}`.padEnd(5000, ".") }));
    authContext.restaurantId = null;
    streamMock.mockReturnValue(providerStream(["Recipe"], { in: 10, out: 20 }));
    const res = await post({ content: history.at(-1)!.content, history }, "preview");
    expect(await res.text()).toContain('"type":"done"');
    expect(streamMock.mock.calls[0]![0].messages).toEqual(history.slice(20));
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it.each([
    { restaurantId: null, model: "daily" },
    { restaurantId: "r1", model: "creative" },
  ] as const)("preview reserves $model once and streams without persistence", async ({ restaurantId, model }) => {
    authContext.restaurantId = restaurantId;
    streamMock.mockReturnValue(providerStream(["Recipe"], { in: 10, out: 20 }));
    const res = await post({ content: "recipe", model, history: [] }, "preview");
    const wire = await res.text();
    expect(res.status).toBe(200);
    expect(wire).toContain('"type":"delta","text":"Recipe"');
    expect(wire).toContain('"type":"done"');
    expect(budget.reserveGeneration).toHaveBeenCalledTimes(1);
    expect(budget.reserveGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: model }), expect.any(Number), "u1");
    expect(streamMock.mock.calls[0]![0].reservation).toBe(reservation);
    expect(budget.reserveGeneration.mock.invocationCallOrder[0]).toBeLessThan(streamMock.mock.invocationCallOrder[0]!);
    expect(budget.releaseGeneration).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
    expect(db.message.findMany).not.toHaveBeenCalled();
    expect(db.message.count).not.toHaveBeenCalled();
    expect(db.conversation.findUnique).not.toHaveBeenCalled();
    expect(db.conversation.updateMany).not.toHaveBeenCalled();
    expect(quota.recordAiTokens).toHaveBeenCalledWith("u1", 10, 20);
  });

  it.each([
    { total: 25, first: 10 },
    { total: 27, first: 10 },
    { total: 29, first: 10 },
    { total: 31, first: 20 },
  ])("saved chat aligns $total messages at $first after appending the unsaved current turn", async ({ total, first }) => {
    // The database history excludes the new message, which has not been saved yet.
    db.message.findMany.mockResolvedValue(Array.from({ length: 20 }, (_, k) => stored(total - 2 - k)));
    db.message.count.mockResolvedValue(total - 1);
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    expect(await (await post({ content: `m${total - 1}` })).text()).toContain('"type":"done"');
    expect(db.message.count).toHaveBeenCalledWith({ where: { conversationId: "conv-1" } });
    const sent = streamMock.mock.calls[0]![0].messages as { role: string; content: string }[];
    expect(sent.map((m) => m.content)).toEqual(Array.from({ length: total - first }, (_, k) => `m${k + first}`));
    expect(sent[0]!.role).toBe("user");
    expect(sent.filter(message => message.content === `m${total - 1}`)).toHaveLength(1);
    expect(budget.reserveGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: "daily" }),
      textInputCeiling({ system: streamMock.mock.calls[0]![0].system, messages: sent }), "u1");
  });

  it("sends the complete short history including the new unsaved user message", async () => {
    db.message.findMany.mockResolvedValue(Array.from({ length: 6 }, (_, k) => stored(5 - k)));
    db.message.count.mockResolvedValue(6);
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    expect(await (await post({ content: "m6" })).text()).toContain('"type":"done"');
    const sent = streamMock.mock.calls[0]![0].messages as { content: string }[];
    expect(sent.map((m) => m.content)).toEqual(Array.from({ length: 7 }, (_, k) => `m${k}`));
  });
});

describe("POST chat — selección de proveedor", () => {
  it("loads ordered chef notes and forwards their texts to the system blocks", async () => {
    db.chefNote.findMany.mockResolvedValue([
      { text: "No usamos cerdo" },
      { text: "El caldo no lleva apio" },
    ]);
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));

    await (await post({ content: "receta" })).text();

    expect(db.chefNote.findMany).toHaveBeenCalledWith({
      where: { restaurantId: "r1" },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { text: true },
    });
    expect(buildSystem).toHaveBeenCalledWith(
      {
        name: "Kokoo",
        identityLine: null,
        chefNotes: ["No usamos cerdo", "El caldo no lleva apio"],
      },
      expect.anything(),
      null,
      null,
    );
  });
  it("loads and forwards recent titles when useful memory is ready", async () => {
    memoryChat.mockResolvedValue("Técnicas de brasa");
    db.recipe.findMany.mockResolvedValue([{ title: "Receta reciente" }]);
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    await (await post({ content: "receta" })).text();
    expect(db.recipe.findMany).toHaveBeenCalledWith({
      where: { restaurantId: "r1", deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { title: true },
    });
    expect(buildSystem).toHaveBeenCalledWith(
      expect.anything(),
      [{ title: "Receta reciente" }],
      null,
      "Técnicas de brasa",
    );
  });

  it.each([
    ["empty", "resolve"],
    ["failure", "reject"],
  ])("falls back to recent titles when memory is %s", async (_label, outcome) => {
    db.recipe.findMany.mockResolvedValue([{ title: "Receta reciente" }]);
    if (outcome === "reject") memoryChat.mockRejectedValue(new Error("database unavailable"));
    else memoryChat.mockResolvedValue("");
    streamMock.mockReturnValue(providerStream(["Lista"], { in: 10, out: 20 }));
    await (await post({ content: "receta" })).text();
    expect(db.recipe.findMany).toHaveBeenCalledTimes(1);
    expect(buildSystem).toHaveBeenCalledWith(expect.anything(), [{ title: "Receta reciente" }], null, null);
  });

  it.each([["daily", "gemini-3.8-flash"], ["sonnet", "gemini-3.8-flash"], ["haiku", "gemini-3.8-flash"], ["creative", "claude-opus-5-5"], ["opus", "claude-opus-5-5"]])("%s conserva el modelo real en la conversación", async (model, expected) => {
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
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await post({ content: "receta", model: "daily" });
    expect(res.status).toBe(503);
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });
  it("logs invalid model configuration without exposing chef or config content", async () => {
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.stubEnv("AI_CHAT_DAILY_MODEL", "bad/model");
    const res = await post({ content: "secret chef prompt", model: "daily" });
    expect(res).not.toBeNull();
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(JSON.parse(body)).toMatchObject({ code: "ai_provider_unconfigured" });
    expect(body).not.toContain("secret chef prompt");
    expect(body).not.toContain("bad/model");
    expect(errorLog).toHaveBeenCalled();
    expect(inspect(errorLog.mock.calls, { depth: 8 })).not.toContain("secret chef prompt");
    expect(streamMock).not.toHaveBeenCalled();
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
  });
});

describe("A2 closed SSE error contract", () => {
  async function errorEvent(error: unknown, id = "conv-1") {
    streamMock.mockImplementation(async function* () { throw error; });
    const wire = await (await post({ content: "secret chef prompt", model: "daily" }, id)).text();
    const records = wire.split("\n\n").filter(Boolean).map(line => JSON.parse(line.replace(/^data: /, "")) as Record<string, unknown>);
    expect(records.some(record => record.type === "done")).toBe(false);
    const errors = records.filter(record => record.type === "error");
    expect(errors).toHaveLength(1);
    expect(ApiErrorCodeSchema.safeParse(errors[0]?.code).success).toBe(true);
    return { event: errors[0]!, wire };
  }

  it.each([
    ["es", "El asistente no respondió. Inténtalo de nuevo."],
    ["en", "The assistant did not respond. Please try again."],
    ["it", "L'assistente non ha risposto. Riprova."],
  ])("localizes provider failure in %s without leaking provider text", async (language, expected) => {
    db.user.findUnique.mockResolvedValue({ languagePref: language });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { event, wire } = await errorEvent(Object.assign(new Error("provider secret body"), { code: "ai_provider_failed" }));
    expect(event).toMatchObject({ code: "ai_provider_failed", message: expected });
    expect(wire).not.toContain("provider secret body");
    expect(wire).not.toContain("secret chef prompt");
    expect(errorLog).toHaveBeenCalled();
    expect(inspect([log.mock.calls, errorLog.mock.calls], { depth: 8 })).not.toContain("secret chef prompt");
  });

  it("defaults to Spanish when languagePref is missing", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const { event } = await errorEvent(new Error("chat_response_incomplete"));
    expect(event).toMatchObject({ code: "chat_response_incomplete", message: "La respuesta quedó incompleta. Inténtalo de nuevo." });
  });

  it.each(["conv-1", "preview"])("emits each of the seven closed A2 codes for %s", async id => {
    for (const code of ["ai_provider_failed", "ai_rate_limited", "ai_timeout", "ai_response_blocked", "chat_refused", "chat_response_incomplete", "chat_context_too_long"]) {
      const { event, wire } = await errorEvent(Object.assign(new Error("private upstream body"), { code }), id);
      expect(event.code, code).toBe(code);
      expect(typeof event.message, code).toBe("string");
      expect(wire, code).not.toContain("private upstream body");
    }
  });

  it("preserves provider retryAfter seconds in an SSE rate limit", async () => {
    const { event } = await errorEvent(Object.assign(new Error("private quota detail"), { code: "ai_rate_limited", retryAfter: 37 }));
    expect(event).toMatchObject({ code: "ai_rate_limited", retryAfter: 37 });
  });

  it("logs an expected provider refusal at warn/info, not error", async () => {
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const warnLog = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const infoLog = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    await errorEvent(new Error("chat_refused"));
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog.mock.calls.length + infoLog.mock.calls.length).toBeGreaterThan(0);
  });

  it("uses the closed provider-failed fallback for unknown errors", async () => {
    const { event, wire } = await errorEvent(new Error("database connection string secret"));
    expect(event).toMatchObject({ code: "ai_provider_failed", message: "El asistente no respondió. Inténtalo de nuevo." });
    expect(wire).not.toContain("database connection string secret");
  });

  it("queries language only for an error, not a successful stream", async () => {
    streamMock.mockReturnValue(providerStream(["Listo"], { in: 5, out: 3 }));
    expect(await (await post({ content: "receta" })).text()).toContain('"type":"done"');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(["preview", "conv-1"])("continues generation without an SSE error after the client's AbortSignal aborts in %s", async id => {
    const controller = new AbortController();
    const infoLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    streamMock.mockImplementation(async function* () {
      yield { type: "delta", text: "Recipe" };
      controller.abort();
      yield { type: "delta", text: " finished" };
      yield { type: "usage", usage: { inputTokens: 20, outputTokens: 5, cachedTokens: 0, reasoningTokens: 0 } };
    });
    const request = new NextRequest(`https://t.local/api/conversations/${id}/messages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "receta" }), signal: controller.signal,
    });
    const wire = await (await route.POST(request, { params: Promise.resolve({ id }) })).text();
    expect(wire).not.toContain('"type":"error"');
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(assistantCreate()?.[0].data.content).toBe(id === "preview" ? undefined : "Recipe finished");
    expect(quota.recordAiTokens).toHaveBeenCalledWith("u1", 20, 5);
    expect(infoLog.mock.calls.flat().some(line => typeof line === "string" && line.includes('"aborted":false'))).toBe(true);
    expect(afterMock).toHaveBeenCalledTimes(1);
  });
});
