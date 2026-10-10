import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimChatTurn, finishChatTurn } from "./chat-turn";
import { maxDuration } from "@/app/api/conversations/[id]/messages/route";
import type { Prisma } from "@atelier/db";

const { db } = vi.hoisted(() => ({ db: {
  conversation: { updateMany: vi.fn() }, message: { findUnique: vi.fn(), create: vi.fn() }, $transaction: vi.fn(),
} }));
vi.mock("@atelier/db", () => ({ prisma: db }));
// Import only the real route duration; no request or provider work runs here.
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: vi.fn(), isNextResponse: vi.fn() }));
vi.mock("@/lib/chat-turn-service", () => ({ prepareChatTurn: vi.fn(), runChatTurn: vi.fn() }));

const now = new Date("2026-10-07T10:00:00Z");
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  db.conversation.updateMany.mockReset().mockResolvedValue({ count: 1 });
  db.message.findUnique.mockReset().mockResolvedValue(null); db.message.create.mockReset();
  db.$transaction.mockReset().mockImplementation(async callback => callback(db));
});

describe("A7 assistant message accounting", () => {
  it("links the budget reservation, not the conversation lease, and preserves cache writes", async () => {
    const turn = { conversationId: "conv-1", generationId: "lease-id", userMessageId: "user-message" };
    // A named object is compatible with the pre-A7 signature without a production stub.
    const usage = { generationId: "budget-reservation-id", inputTokens: 60, outputTokens: 90,
      cachedTokens: 30, cacheWriteTokens: 20, latencyMs: 250 };
    await finishChatTurn(turn, "Finished recipe", "claude-opus-5-5", usage);

    const expected = { generationId: usage.generationId, cacheWriteTokens: 20 } satisfies
      Pick<Prisma.MessageCreateManyInput, "generationId" | "cacheWriteTokens">;
    expect(db.message.create).toHaveBeenCalledTimes(1);
    expect(db.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      ...expected, conversationId: "conv-1", role: "assistant", responseToId: "user-message",
      content: "Finished recipe", modelId: "claude-opus-5-5",
      // Total input includes reads and writes; 60 - 30 - 20 = 10 uncached tokens.
      inputTokens: 60, outputTokens: 90, cachedTokens: 30, latencyMs: 250,
    }) });
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "conv-1", generationId: "lease-id" },
      data: { generationId: null, generationStartedAt: null },
    });
  });

  it.each([undefined, 0])("stores unknown cache writes as null but preserves %s", async cacheWriteTokens => {
    const usage = { generationId: "budget-reservation-id", cacheWriteTokens, latencyMs: 250 };
    await finishChatTurn({ conversationId: "conv-1", generationId: "lease-id", userMessageId: "user-message" },
      "Finished recipe", "gemini-3.8-flash", usage);
    expect(db.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      generationId: "budget-reservation-id", inputTokens: null, outputTokens: null,
      cachedTokens: null, cacheWriteTokens: cacheWriteTokens ?? null, latencyMs: 250,
    }) });
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("A6 lease window and Stop fencing", () => {
  it("uses maxDuration plus a small stale-lease margin, not ten minutes", async () => {
    await claimChatTurn("conv-1", "r1", "Recipe", "a6-message-id");
    const threshold = db.conversation.updateMany.mock.calls[0]![0].where.OR[1].generationStartedAt.lt as Date;
    const staleAfterMs = now.getTime() - threshold.getTime();
    expect(staleAfterMs).toBeGreaterThan(maxDuration * 1_000);
    expect(staleAfterMs).toBeLessThanOrEqual((maxDuration + 60) * 1_000);
  });

  it.each([
    { ageSeconds: 300, expectedStatus: 409 },
    { ageSeconds: 361, expectedStatus: 200 },
  ])("a lease aged $ageSeconds seconds returns $expectedStatus", async ({ ageSeconds, expectedStatus }) => {
    const startedAt = new Date(now.getTime() - ageSeconds * 1_000);
    db.conversation.updateMany.mockImplementationOnce(async ({ where }) => ({
      count: startedAt < where.OR[1].generationStartedAt.lt ? 1 : 0,
    }));
    const result = await claimChatTurn("conv-1", "r1", "Recipe", "a6-message-id");
    expect(result instanceof Response ? result.status : 200).toBe(expectedStatus);
    if (expectedStatus === 409) expect(db.message.findUnique).not.toHaveBeenCalled();
  });

  it("finish refuses a completed answer when Stop removed the fence", async () => {
    db.conversation.updateMany.mockResolvedValueOnce({ count: 0 });
    const turn = { conversationId: "conv-1", generationId: "stopped-generation", userMessageId: "user-message" };
    await expect(finishChatTurn(turn, "Finished recipe", "test-model", { inputTokens: 100, outputTokens: 13, latencyMs: 100 }))
      .rejects.toThrow("chat_generation_expired");
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "conv-1", generationId: "stopped-generation" },
      data: { generationId: null, generationStartedAt: null },
    });
    expect(db.message.create).not.toHaveBeenCalled();
  });
});
