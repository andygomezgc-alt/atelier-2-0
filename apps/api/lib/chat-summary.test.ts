import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db, budget, haikuCreate, haikuClient } = vi.hoisted(() => ({
  db: {
    conversationSummary: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    message: { findMany: vi.fn() },
    conversation: { findUnique: vi.fn(), update: vi.fn() },
  },
  budget: { reserveGeneration: vi.fn(), settleGeneration: vi.fn(), releaseGeneration: vi.fn(), settleInterruptedGeneration: vi.fn() },
  haikuCreate: vi.fn(), haikuClient: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/ai/budget", () => budget);
vi.mock("@anthropic-ai/sdk", async importOriginal => ({
  ...(await importOriginal<typeof import("@anthropic-ai/sdk")>()),
  default: class {
    messages = { create: haikuCreate };
    constructor(options: unknown) { haikuClient(options); }
  },
}));

import { InternalServerError } from "@anthropic-ai/sdk";
import { capSummary, loadChatSummary, nextSummaryThrough, refreshChatSummary, SUMMARY_MAX_CHARS } from "./chat-summary";
import { stableHistoryWindow } from "./ai/chat";
import { AiBudgetError } from "./ai/budget-policy";
import type { Reservation } from "./ai/budget";
import type { Msg } from "./anthropic";
import { logger } from "./logger";

const reservation: Reservation = {
  id: "summary-hold", budgetId: "pilot", micros: 10_000,
  rate: { input: .75, output: 3.75, cached: .075, cacheWrite: .75 },
};
const message = (i: number, size = 0): Msg => ({ role: i % 2 === 0 ? "user" : "assistant", content: `m${i}${"x".repeat(size)}` });
let chat: Msg[] = [];
const conversation = (count: number, size = 0) => { chat = Array.from({ length: count }, (_, i) => message(i, size)); };
const input = (overrides: Partial<Parameters<typeof refreshChatSummary>[0]> = {}) => ({
  conversationId: "conv-1", model: "daily" as const, userId: "u1", persistedCount: 30, ...overrides,
});
const SUMMARY = "Decidido:\n- Base de tomate asado\nDescartado:\n- Nata\nPendiente:\n- Emplatado\nDatos del plato:\n- Horno a 180 °C, 25 min";
const geminiReply = (text = SUMMARY, finishReason = "STOP") => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: "razonamiento", thought: true }, { text }] }, finishReason }],
  usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120, thoughtsTokenCount: 30 },
}), { status: 200, headers: { "content-type": "application/json" } });
const haikuReply = (text = SUMMARY, stop_reason = "end_turn") => ({
  content: [{ type: "text", text }], stop_reason, stop_details: null,
  usage: { input_tokens: 800, output_tokens: 90, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});
let fetcher: ReturnType<typeof vi.fn>;
type Payload = { previousSummary?: string; messages: { role: string; content: string }[] };
const geminiRequest = () => { expect(fetcher).toHaveBeenCalledTimes(1); return JSON.parse(fetcher.mock.calls[0]![1].body); };
const geminiPayload = (): Payload => JSON.parse(geminiRequest().contents[0].parts[0].text);
const stored = () => {
  expect(db.conversationSummary.create).toHaveBeenCalledTimes(1);
  return db.conversationSummary.create.mock.calls[0]![0].data as { conversationId: string; through: number; text: string; model: string };
};
const messageQuery = () => { expect(db.message.findMany).toHaveBeenCalledTimes(1); return db.message.findMany.mock.calls[0]![0]; };
const haikuParams = () => { expect(haikuCreate).toHaveBeenCalledTimes(1); return haikuCreate.mock.calls[0]![0]; };

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "gemini-test"); vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test");
  conversation(30);
  db.conversationSummary.findFirst.mockReset().mockResolvedValue(null);
  db.conversationSummary.findMany.mockReset().mockResolvedValue([]);
  db.conversationSummary.create.mockReset().mockImplementation(async ({ data }) => data);
  db.conversationSummary.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  db.conversation.findUnique.mockReset().mockResolvedValue({ summaryFailedThrough: null, summaryFailures: 0 });
  db.conversation.update.mockReset().mockResolvedValue({});
  db.message.findMany.mockReset().mockImplementation(async ({ skip = 0, take }: { skip?: number; take: number }) =>
    chat.slice(skip, skip + take).map(({ role, content }) => ({ role, content })));
  budget.reserveGeneration.mockReset().mockResolvedValue(reservation);
  for (const close of [budget.settleGeneration, budget.releaseGeneration, budget.settleInterruptedGeneration]) close.mockReset().mockResolvedValue(undefined);
  haikuCreate.mockReset().mockResolvedValue(haikuReply()); haikuClient.mockReset();
  fetcher = vi.fn().mockImplementation(async () => geminiReply());
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("nextSummaryThrough", () => {
  it.each([[19, 0], [20, 10], [21, 10], [30, 20], [31, 20], [40, 30]])("after %i saved messages the next window starts at %i", (saved, start) => {
    expect(nextSummaryThrough(saved)).toBe(start);
  });

  it("matches where stableHistoryWindow starts the next turn's history", () => {
    for (const saved of [0, 9, 19, 20, 21, 29, 30, 31, 39, 40, 41, 55]) {
      const total = saved + 1; // The next turn appends one user message.
      const history = Array.from({ length: Math.min(total, 21) }, (_, k) => message(total - Math.min(total, 21) + k));
      const window = stableHistoryWindow(history, total);
      expect(nextSummaryThrough(saved), `${saved} saved messages`).toBe(total - window.length);
    }
  });
});

describe("capSummary", () => {
  it("keeps a short summary and only normalizes line endings and outer spaces", () => {
    expect(capSummary(`  ${SUMMARY.replace(/\n/g, "\r\n")}\n `)).toBe(SUMMARY);
  });

  it("caps a long summary at a line boundary", () => {
    const long = Array.from({ length: 200 }, (_, k) => `- Punto ${k}: horno a 180 °C`).join("\n");
    const capped = capSummary(long);
    expect(capped.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(capped.length).toBeGreaterThan(SUMMARY_MAX_CHARS / 2);
    expect(long.startsWith(capped)).toBe(true);
    expect(long[capped.length]).toBe("\n");
  });

  it("never leaves half of a surrogate pair", () => {
    const capped = capSummary(`${"a".repeat(SUMMARY_MAX_CHARS - 1)}😀${"b".repeat(50)}`);
    expect(capped.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(capped).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe("loadChatSummary", () => {
  it("reads the newest summary that ends at or before the window start", async () => {
    db.conversationSummary.findFirst.mockResolvedValue({ text: "Resumen hasta 20" });
    expect(await loadChatSummary("conv-1", 20)).toBe("Resumen hasta 20");
    expect(db.conversationSummary.findFirst).toHaveBeenCalledWith({
      where: { conversationId: "conv-1", through: { lte: 20 } }, orderBy: { through: "desc" }, select: { text: true },
    });
  });

  it("does not query before the window has left a first block", async () => {
    expect(await loadChatSummary("conv-1", 0)).toBeNull();
    expect(await loadChatSummary("conv-1", 9)).toBeNull();
    expect(db.conversationSummary.findFirst).not.toHaveBeenCalled();
  });

  it("degrades to no summary when the read fails", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    db.conversationSummary.findFirst.mockRejectedValue(new Error("database down"));
    db.conversationSummary.findFirst.mockClear();
    await expect(loadChatSummary("conv-1", 10)).resolves.toBeNull();
    expect(db.conversationSummary.findFirst).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("chat_summary_read_failed", expect.objectContaining({ conversationId: "conv-1" }));
  });
});

describe("refreshChatSummary", () => {
  it("does nothing while every saved message still fits in the next window", async () => {
    conversation(19);
    await refreshChatSummary(input({ persistedCount: 19 }));
    expect(db.conversationSummary.findMany).not.toHaveBeenCalled();
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("summarizes the first block once the window is about to leave it", async () => {
    conversation(20);
    await refreshChatSummary(input({ persistedCount: 20 }));
    expect(messageQuery()).toMatchObject({ where: { conversationId: "conv-1" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: 0, take: 10 });
    expect(geminiPayload().messages.map(m => m.content)).toEqual(Array.from({ length: 10 }, (_, k) => `m${k}`));
    expect(stored()).toEqual({ conversationId: "conv-1", through: 10, text: SUMMARY, model: "gemini-3.8-flash" });
  });

  it("generates a summary only once per window start", async () => {
    db.conversationSummary.findMany.mockResolvedValue([{ through: 10, text: "Antes" }, { through: 20, text: "Ya escrito" }]);
    await refreshChatSummary(input({ persistedCount: 30 }));
    expect(db.conversationSummary.findMany).toHaveBeenCalledTimes(1);
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.conversationSummary.create).not.toHaveBeenCalled();
  });

  it("rolls the previous summary forward with only the 10-message block that leaves, then prunes older rows", async () => {
    db.conversationSummary.findMany.mockResolvedValue([{ through: 10, text: "Decidido: base de tomate" }]);
    await refreshChatSummary(input({ persistedCount: 30 }));
    expect(messageQuery()).toMatchObject({ skip: 10, take: 10 });
    const payload = geminiPayload();
    expect(payload.previousSummary).toBe("Decidido: base de tomate");
    expect(payload.messages.map(m => m.content)).toEqual(Array.from({ length: 10 }, (_, k) => `m${k + 10}`));
    expect(payload.messages.slice(0, 2).map(m => m.role)).toEqual(["chef", "assistant"]);
    expect(stored()).toMatchObject({ through: 20, text: SUMMARY });
    expect(db.conversationSummary.deleteMany).toHaveBeenCalledWith({ where: { conversationId: "conv-1", through: { lt: 10 } } });
  });

  it("rolls forward from an older summary when a step was skipped, and keeps it until the new one exists", async () => {
    conversation(40);
    db.conversationSummary.findMany.mockResolvedValue([{ through: 10, text: "Decidido: base de tomate" }]);
    await refreshChatSummary(input({ persistedCount: 40 }));
    expect(messageQuery()).toMatchObject({ skip: 10, take: 20 });
    expect(geminiPayload().previousSummary).toBe("Decidido: base de tomate");
    expect(stored().through).toBe(30);
    expect(db.conversationSummary.deleteMany).toHaveBeenCalledWith({ where: { conversationId: "conv-1", through: { lt: 10 } } });
  });

  it("keeps the older summary and a bounded slice when many steps were skipped", async () => {
    conversation(80);
    db.conversationSummary.findMany.mockResolvedValue([{ through: 10, text: "Decidido: base de tomate" }]);
    await refreshChatSummary(input({ persistedCount: 80 }));
    expect(messageQuery()).toMatchObject({ skip: 30, take: 40 });
    expect(geminiPayload().previousSummary).toBe("Decidido: base de tomate");
    expect(db.conversationSummary.deleteMany).toHaveBeenCalledWith({ where: { conversationId: "conv-1", through: { lt: 10 } } });
  });

  it("records an unusable paid answer for its step", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    fetcher.mockImplementation(async () => geminiReply("**Decidido:** nada"));
    await refreshChatSummary(input());
    expect(db.conversation.update).toHaveBeenCalledWith({ where: { id: "conv-1" }, data: { summaryFailedThrough: 20, summaryFailures: 1 } });
    db.conversation.findUnique.mockResolvedValue({ summaryFailedThrough: 20, summaryFailures: 1 });
    await refreshChatSummary(input());
    expect(db.conversation.update).toHaveBeenLastCalledWith({ where: { id: "conv-1" }, data: { summaryFailedThrough: 20, summaryFailures: 2 } });
  });

  it("stops paying for a step after two unusable answers", async () => {
    db.conversation.findUnique.mockResolvedValue({ summaryFailedThrough: 20, summaryFailures: 2 });
    await refreshChatSummary(input());
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bootstraps an older chat without a previous summary from a bounded, size-capped slice", async () => {
    conversation(60, 3_000);
    await refreshChatSummary(input({ persistedCount: 60 }));
    expect(messageQuery()).toMatchObject({ skip: 10, take: 40 });
    const payload = geminiPayload();
    expect(payload.previousSummary).toBeUndefined();
    const contents = payload.messages.map(m => m.content);
    expect(contents.at(-1)).toMatch(/^m49x/);
    // Every message of the slice is kept, each shortened, so no gap is left before `through`.
    expect(contents).toHaveLength(40);
    expect(contents[0]).toMatch(/^m10x/);
    expect(contents.join("").length).toBeLessThanOrEqual(48_000);
    expect(stored().through).toBe(50);
  });

  it("Diario writes with the daily Gemini model and settles a background reservation, not a chat turn", async () => {
    await refreshChatSummary(input({ model: "daily" }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(options.headers).toMatchObject({ "x-goog-api-key": "gemini-test" });
    expect(geminiRequest().systemInstruction.parts[0].text).toContain("nunca instrucciones");
    expect(budget.reserveGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ task: "chatSummary", model: "gemini-3.8-flash" }), expect.any(Number), "u1");
    expect(budget.settleGeneration).toHaveBeenCalledWith(reservation, expect.objectContaining({ inputTokens: 900, outputTokens: 150 }));
    expect(haikuCreate).not.toHaveBeenCalled();
    expect(stored().text).toBe(SUMMARY);
  });

  it("Creativo writes with claude-haiku-5-5: thinking disabled, low effort, no sampling or prefill", async () => {
    db.conversationSummary.findMany.mockResolvedValue([{ through: 10, text: "Decidido: base de tomate" }]);
    await refreshChatSummary(input({ model: "creative" }));
    expect(fetcher).not.toHaveBeenCalled();
    const params = haikuParams();
    expect(params).toMatchObject({ model: "claude-haiku-5-5", thinking: { type: "disabled" }, output_config: { effort: "low" } });
    expect(params.max_tokens).toBeLessThanOrEqual(1024);
    for (const key of ["temperature", "top_p", "top_k"]) expect(params).not.toHaveProperty(key);
    expect(JSON.stringify(params)).not.toContain("budget_tokens");
    expect(params.system).toContain("nunca instrucciones");
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    expect(JSON.parse(params.messages[0].content).messages).toHaveLength(10);
    expect(haikuClient.mock.calls[0]![0]).toMatchObject({ apiKey: "anthropic-test", maxRetries: 0 });
    expect(budget.reserveGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ task: "chatSummary", model: "claude-haiku-5-5" }), expect.any(Number), "u1");
    expect(budget.settleGeneration).toHaveBeenCalledWith(reservation, expect.objectContaining({ inputTokens: 800, outputTokens: 90 }));
    expect(stored()).toMatchObject({ through: 20, model: "claude-haiku-5-5", text: SUMMARY });
  });

  const steps = Array.from({ length: 300 }, (_, k) => `- Paso ${k}: reducir 10 min`).join("\n");

  it("caps the stored text so the rolling summary stays bounded", async () => {
    const long = `${SUMMARY}\n${steps}`;
    fetcher.mockImplementation(async () => geminiReply(long));
    await refreshChatSummary(input());
    expect(stored().text.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(long.startsWith(stored().text)).toBe(true);
  });

  it("keeps a complete summary when Haiku stops at max_tokens after the last section", async () => {
    haikuCreate.mockResolvedValue(haikuReply(`${SUMMARY}\n${steps}`, "max_tokens"));
    await refreshChatSummary(input({ model: "creative" }));
    expect(stored().text.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(budget.settleGeneration).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Haiku stops at max_tokens", "creative" as const],
    ["Gemini stops at MAX_TOKENS", "daily" as const],
  ])("bills but never stores a summary cut before its last sections when %s", async (_label, model) => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const cut = `Decidido:\n- Base de tomate asado\nDescartado:\n${steps}`;
    haikuCreate.mockResolvedValue(haikuReply(cut, "max_tokens"));
    fetcher.mockImplementation(async () => geminiReply(cut, "MAX_TOKENS"));
    await refreshChatSummary(input({ model }));
    expect(budget.settleGeneration).toHaveBeenCalledTimes(1);
    expect(db.conversationSummary.create).not.toHaveBeenCalled();
  });

  it.each([
    ["Haiku stops at max_tokens", "creative" as const],
    ["Gemini stops at MAX_TOKENS", "daily" as const],
  ])("drops the half-written last line when %s", async (_label, model) => {
    const cut = `${SUMMARY}
- Reducir a 18`;
    haikuCreate.mockResolvedValue(haikuReply(cut, "max_tokens"));
    fetcher.mockImplementation(async () => geminiReply(cut, "MAX_TOKENS"));
    await refreshChatSummary(input({ model }));
    expect(stored().text).toBe(SUMMARY);
  });

  it("keeps every section of a complete summary longer than the cap", async () => {
    const lines = (word: string, count: number) => Array.from({ length: count }, (_, k) => `- ${word} ${k}: reducir a fuego lento`).join("\n");
    const long = `Decidido:\n${lines("Paso", 40)}\nDescartado:\n${lines("Idea", 30)}\nPendiente:\n- Emplatado\nDatos del plato:\n- Horno a 180 °C, 25 min`;
    fetcher.mockImplementation(async () => geminiReply(long));
    await refreshChatSummary(input());
    const text = stored().text;
    expect(text.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    for (const section of ["Decidido:", "Descartado:", "Pendiente:", "Datos del plato:"]) expect(text.split("\n")).toContain(section);
    expect(text).toContain("- Horno a 180 °C, 25 min");
    expect(text).toContain("- Emplatado");
  });

  it("never stores a summary that lacks one of the four sections", async () => {
    fetcher.mockImplementation(async () => geminiReply(SUMMARY.replace("Pendiente:", "Pendientes")));
    await refreshChatSummary(input());
    expect(db.conversationSummary.create).not.toHaveBeenCalled();
  });

  it("gives Gemini room for its thinking inside the output limit", async () => {
    await refreshChatSummary(input());
    expect(geminiRequest().generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(4096);
  });

  it("bills a refusal but stores nothing", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    haikuCreate.mockResolvedValue(haikuReply("", "refusal"));
    await expect(refreshChatSummary(input({ model: "creative" }))).resolves.toBeUndefined();
    expect(budget.settleGeneration).toHaveBeenCalledTimes(1);
    expect(db.conversationSummary.create).not.toHaveBeenCalled();
  });

  it("skips silently when the budget refuses the background call", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    budget.reserveGeneration.mockRejectedValue(new AiBudgetError("ai_budget_exhausted"));
    await expect(refreshChatSummary(input())).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.conversationSummary.create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("chat_summary_failed", expect.objectContaining({ conversationId: "conv-1", through: 20, code: "ai_budget_exhausted" }));
    // Nothing was paid: a budget refusal is not an attempt.
    expect(db.conversation.update).not.toHaveBeenCalled();
  });

  it.each([
    ["an HTTP error", () => fetcher.mockImplementation(async () => new Response("overloaded", { status: 503 }))],
    ["a network failure", () => fetcher.mockRejectedValue(new TypeError("network down"))],
  ])("counts %s from the provider as an attempt for its step", async (_label, fail) => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    fail();
    await refreshChatSummary(input());
    expect(db.conversation.update).toHaveBeenCalledWith({ where: { id: "conv-1" }, data: { summaryFailedThrough: 20, summaryFailures: 1 } });
  });

  it("releases the hold when the provider answers with an HTTP error, and never throws", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    fetcher.mockImplementation(async () => new Response("overloaded", { status: 503 }));
    await expect(refreshChatSummary(input())).resolves.toBeUndefined();
    expect(budget.releaseGeneration).toHaveBeenCalledWith(reservation);
    expect(budget.settleGeneration).not.toHaveBeenCalled();
    expect(db.conversationSummary.create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("chat_summary_failed", expect.objectContaining({ through: 20 }));

    haikuCreate.mockRejectedValue(new InternalServerError(500, { type: "error" }, "boom", new Headers()));
    await expect(refreshChatSummary(input({ model: "creative" }))).resolves.toBeUndefined();
    expect(budget.releaseGeneration).toHaveBeenCalledTimes(2);
  });

  it("keeps the hold when a request may have reached the provider", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    fetcher.mockRejectedValue(new TypeError("network down"));
    await expect(refreshChatSummary(input())).resolves.toBeUndefined();
    expect(budget.releaseGeneration).not.toHaveBeenCalled();
    expect(budget.settleGeneration).not.toHaveBeenCalled();
  });

  it("never throws when the database fails", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    db.conversationSummary.findMany.mockRejectedValue(new Error("database down"));
    await expect(refreshChatSummary(input())).resolves.toBeUndefined();
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("chat_summary_failed", expect.objectContaining({ conversationId: "conv-1" }));
  });

  it("treats a concurrent writer's unique violation as done", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    db.conversationSummary.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    await expect(refreshChatSummary(input())).resolves.toBeUndefined();
    expect(db.conversationSummary.create).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalledWith("chat_summary_failed", expect.anything());
  });

  it("does not spend when the provider is unconfigured or the request deadline is too close", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await refreshChatSummary(input({ model: "creative" }));
    await refreshChatSummary(input({ deadlineAt: Date.now() + 1_000 }));
    expect(budget.reserveGeneration).not.toHaveBeenCalled();
    expect(haikuCreate).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
