import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../ai/budget", () => ({ isAiOwner: vi.fn().mockResolvedValue(false) }));
import { isAiOwner } from "../ai/budget";

// --- Prisma mock (vi.hoisted: el factory de vi.mock se eleva sobre los
// consts, así que declaramos el mock también elevado). ---
const { aiUsage } = vi.hoisted(() => ({
  aiUsage: { upsert: vi.fn(), update: vi.fn() },
}));

vi.mock("@atelier/db", () => ({
  prisma: { aiUsage },
}));

import {
  reserveAiCall,
  recordAiTokens,
  aiQuotaExceededResponse,
  utcDay,
  secondsToUtcMidnight,
  AI_DAILY_LIMIT,
} from "../ai-quota";

beforeEach(() => {
  vi.mocked(isAiOwner).mockResolvedValue(false);
  aiUsage.upsert.mockReset();
  aiUsage.update.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("reserveAiCall", () => {
  it("does not apply the generic daily cap to the owner, but still records usage", async () => {
    vi.mocked(isAiOwner).mockResolvedValue(true);
    aiUsage.upsert.mockResolvedValue({ requestCount: 10000 });
    expect((await reserveAiCall("owner")).ok).toBe(true);
    expect(aiUsage.upsert).toHaveBeenCalledOnce();
  });
  it("deja pasar cuando el contador está en el tope o por debajo", async () => {
    aiUsage.upsert.mockResolvedValue({ requestCount: AI_DAILY_LIMIT });
    const r = await reserveAiCall("user-1");
    expect(r.ok).toBe(true);
    // Incremento atómico: create con 1, update con increment.
    expect(aiUsage.upsert).toHaveBeenCalledOnce();
    const arg = aiUsage.upsert.mock.calls[0]![0];
    expect(arg.create.requestCount).toBe(1);
    expect(arg.update.requestCount).toEqual({ increment: 1 });
    expect(arg.where.userId_day.userId).toBe("user-1");
  });

  it("bloquea (429 lógico) cuando el contador supera el tope", async () => {
    aiUsage.upsert.mockResolvedValue({ requestCount: AI_DAILY_LIMIT + 1 });
    const r = await reserveAiCall("user-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.limit).toBe(AI_DAILY_LIMIT);
      expect(r.retryAfter).toBeGreaterThan(0);
      expect(r.retryAfter).toBeLessThanOrEqual(86_400);
    }
  });
});

describe("recordAiTokens", () => {
  it("suma tokens al día actual", async () => {
    aiUsage.upsert.mockResolvedValue({});
    await recordAiTokens("user-1", 1000, 250);
    const arg = aiUsage.upsert.mock.calls[0]![0];
    expect(arg.update.inputTokens).toEqual({ increment: 1000 });
    expect(arg.update.outputTokens).toEqual({ increment: 250 });
    // First chat of the day creates telemetry without consuming the separate
    // technical-action quota, including a stream finishing after UTC midnight.
    expect(arg.create).toEqual({ userId: "user-1", day: utcDay(), inputTokens: 1000, outputTokens: 250 });
    expect(arg.update).not.toHaveProperty("requestCount");
  });

  it("es best-effort: nunca lanza aunque la base falle", async () => {
    aiUsage.upsert.mockRejectedValue(new Error("db down"));
    await expect(recordAiTokens("user-1", 10, 10)).resolves.toBeUndefined();
  });

  it("clampa negativos a 0", async () => {
    aiUsage.upsert.mockResolvedValue({});
    await recordAiTokens("user-1", -5, -9);
    const arg = aiUsage.upsert.mock.calls[0]![0];
    expect(arg.update.inputTokens).toEqual({ increment: 0 });
    expect(arg.update.outputTokens).toEqual({ increment: 0 });
  });
});

describe("helpers de fecha", () => {
  it("utcDay devuelve YYYY-MM-DD en UTC", () => {
    expect(utcDay(Date.UTC(2026, 6, 8, 23, 59))).toBe("2026-07-08");
    // 00:30 UTC del 9 → sigue siendo día 9 (no se corre por timezone local).
    expect(utcDay(Date.UTC(2026, 6, 9, 0, 30))).toBe("2026-07-09");
  });

  it("secondsToUtcMidnight es positivo y <= 24h", () => {
    const s = secondsToUtcMidnight(Date.UTC(2026, 6, 8, 12, 0, 0));
    expect(s).toBe(12 * 3600);
  });
});

describe("aiQuotaExceededResponse", () => {
  it("es 429 con code ai_daily_limit y header Retry-After", async () => {
    const res = aiQuotaExceededResponse(3600);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    const body = await res.json();
    expect(body.code).toBe("ai_daily_limit");
  });
});
