import { describe, expect, it, vi } from "vitest";
import { reconcileAiHolds } from "./reconcile-ai-holds-runner";

const now = new Date("2026-10-06T12:00:00Z");
const rows = [
  { id: "generation-a", budgetId: "budget-a", model: "model-a", reservedMicros: 900_000 },
  { id: "generation-b", budgetId: "budget-b", model: "model-b", reservedMicros: 50_000 },
  { id: "generation-c", budgetId: "budget-c", model: "model-a", reservedMicros: 40_000 },
];

function fixture() {
  const prisma = {
    aiGeneration: {
      findMany: vi.fn().mockResolvedValue(rows),
      aggregate: vi.fn(async (query: { where: { model: string } }) => ({
        _max: { chargedMicros: query.where.model === "model-a" ? 61_000 : null },
      })),
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const expireGeneration = vi.fn<(budgetId: string, generationId: string, chargeMicros: number) => Promise<boolean>>()
    .mockResolvedValue(true);
  const log = { log: vi.fn<(message: string) => void>(), error: vi.fn<(message: string) => void>() };
  return { prisma, expireGeneration, now, log };
}

function logged(deps: ReturnType<typeof fixture>) {
  return deps.log.log.mock.calls.map(([message]) => JSON.parse(message));
}

describe("AI hold reconciliation Prisma wiring (A4b)", () => {
  it("queries stale holds and settled history using the injected time, once per distinct model", async () => {
    const deps = fixture();
    await reconcileAiHolds(["--older-than-minutes=90"], deps);
    expect(deps.prisma.aiGeneration.findMany.mock.calls).toEqual([[{
      where: { status: "reserved", createdAt: { lt: new Date("2026-10-06T10:30:00Z") } },
      select: { id: true, budgetId: true, model: true, reservedMicros: true },
      orderBy: { createdAt: "asc" },
    }]]);
    expect(deps.prisma.aiGeneration.aggregate.mock.calls).toEqual(["model-a", "model-b"].map(model => [{
      where: { model, status: "settled", chargedMicros: { not: null }, finishedAt: { gte: new Date("2026-09-06T12:00:00Z") } },
      _max: { chargedMicros: true },
    }]));
  });

  it("defaults to dry-run, logs the plan, and never expires a generation", async () => {
    const deps = fixture();
    const exitCode = await reconcileAiHolds([], deps);
    expect(logged(deps)).toEqual([{
      mode: "dry-run", olderThanMinutes: 30, count: 3, heldMicros: 990_000, chargeMicros: 151_000,
      generations: rows.map((row, index) => ({ ...row, chargeMicros: [61_000, 50_000, 40_000][index] })),
    }]);
    expect(deps.expireGeneration).not.toHaveBeenCalled();
    expect(deps.log.error).not.toHaveBeenCalled();
    expect(deps.prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(0);
  });

  it("--apply expires each planned row with its own budget, id, and capped charge", async () => {
    const deps = fixture();
    const exitCode = await reconcileAiHolds(["--apply"], deps);
    expect(deps.expireGeneration.mock.calls).toEqual([
      ["budget-a", "generation-a", 61_000],
      ["budget-b", "generation-b", 50_000],
      ["budget-c", "generation-c", 40_000],
    ]);
    expect(logged(deps)[0]).toMatchObject({ mode: "apply" });
    expect(logged(deps)[1]).toEqual({ status: "done", expired: 3, skipped: 0, failed: 0 });
    expect(deps.prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(0);
  });

  it("falls back to the whole hold when Prisma returns _max.chargedMicros null", async () => {
    const deps = fixture();
    deps.prisma.aiGeneration.aggregate.mockResolvedValue({ _max: { chargedMicros: null } });
    await reconcileAiHolds(["--apply"], deps);
    expect(deps.expireGeneration.mock.calls).toEqual(rows.map(row => [row.budgetId, row.id, row.reservedMicros]));
    expect(logged(deps)[0]).toMatchObject({ chargeMicros: 990_000 });
  });

  it("counts already-closed rows as skipped, not failed, and returns success", async () => {
    const deps = fixture();
    deps.expireGeneration.mockResolvedValueOnce(false);
    const exitCode = await reconcileAiHolds(["--apply"], deps);
    expect(deps.expireGeneration).toHaveBeenCalledTimes(3);
    expect(logged(deps)[1]).toEqual({ status: "done", expired: 2, skipped: 1, failed: 0 });
    expect(deps.log.error).not.toHaveBeenCalled();
    expect(exitCode).toBe(0);
  });

  it("continues after an expiry failure, reports separate counts, and returns exit code 1", async () => {
    const deps = fixture();
    deps.expireGeneration.mockRejectedValueOnce(new Error("expiry failed")).mockResolvedValueOnce(false);
    const exitCode = await reconcileAiHolds(["--apply"], deps);
    expect(deps.expireGeneration.mock.calls).toEqual([
      ["budget-a", "generation-a", 61_000],
      ["budget-b", "generation-b", 50_000],
      ["budget-c", "generation-c", 40_000],
    ]);
    expect(logged(deps)[1]).toEqual({ status: "partial", expired: 1, skipped: 1, failed: 1 });
    expect(deps.log.error.mock.calls.map(([message]) => JSON.parse(message))).toEqual([
      { evt: "reconcile_failed", generationId: "generation-a", error: "expiry failed" },
    ]);
    expect(deps.prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(1);
  });

  it("handles an empty result without history lookups or expiries", async () => {
    const deps = fixture();
    deps.prisma.aiGeneration.findMany.mockResolvedValue([]);
    const exitCode = await reconcileAiHolds(["--apply"], deps);
    expect(deps.prisma.aiGeneration.aggregate).not.toHaveBeenCalled();
    expect(deps.expireGeneration).not.toHaveBeenCalled();
    expect(logged(deps)).toEqual([
      { mode: "apply", olderThanMinutes: 30, count: 0, heldMicros: 0, chargeMicros: 0, generations: [] },
      { status: "done", expired: 0, skipped: 0, failed: 0 },
    ]);
    expect(deps.prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(0);
  });
});
