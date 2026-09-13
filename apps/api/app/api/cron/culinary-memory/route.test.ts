import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, processMemory, maintainMemoryRuns, providerConfig, logger } = vi.hoisted(() => ({
  db: { culinaryMemory: { findMany: vi.fn() } },
  processMemory: vi.fn(),
  maintainMemoryRuns: vi.fn(),
  providerConfig: vi.fn(),
  logger: { info: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/culinary-memory/worker", () => ({ processMemory, maintainMemoryRuns }));
vi.mock("@/lib/culinary-memory/provider", () => ({
  memoryProviderConfig: providerConfig,
  generateMemory: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger }));

import { GET } from "./route";
import { CRON_DEADLINE_MS, MAINTENANCE_BUDGET_MS, MINIMUM_ROW_TIME_MS } from "@/lib/culinary-memory/scheduling";

const started = new Date("2026-09-13T05:00:00Z");
const request = (token = "secret") => new NextRequest("https://local/api/cron/culinary-memory", {
  headers: { authorization: `Bearer ${token}` },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(started);
  vi.stubEnv("CRON_SECRET", "secret");
  vi.clearAllMocks();
  providerConfig.mockReturnValue({ provider: "fixture", model: "test" });
  maintainMemoryRuns.mockResolvedValue(undefined);
  db.culinaryMemory.findMany.mockResolvedValue([]);
  processMemory.mockResolvedValue("completed");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("culinary memory cron", () => {
  it("rejects missing or invalid authentication before touching maintenance", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "secret");
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(maintainMemoryRuns).not.toHaveBeenCalled();
    expect(db.culinaryMemory.findMany).not.toHaveBeenCalled();
  });

  it("performs local maintenance but no generation when the provider is unconfigured", async () => {
    providerConfig.mockReturnValue(null);
    const response = await GET(request());
    expect(await response.json()).toEqual({ status: "unconfigured", processed: 0 });
    expect(maintainMemoryRuns).toHaveBeenCalledWith(started, +started + MAINTENANCE_BUDGET_MS);
    expect(db.culinaryMemory.findMany).not.toHaveBeenCalled();
    expect(processMemory).not.toHaveBeenCalled();
  });

  it("selects at most 20 due restaurants in deterministic order and processes sequentially", async () => {
    db.culinaryMemory.findMany.mockResolvedValue([{ restaurantId: "a" }, { restaurantId: "b" }]);
    const active: string[] = [];
    processMemory.mockImplementation(async id => {
      expect(active).toHaveLength(0);
      active.push(id);
      await Promise.resolve();
      active.pop();
      return id === "a" ? "completed" : "unchanged";
    });
    const response = await GET(request());
    expect(db.culinaryMemory.findMany).toHaveBeenCalledWith({
      where: { enabled: true, nextCheckAt: { lte: started } },
      orderBy: [{ nextCheckAt: "asc" }, { restaurantId: "asc" }],
      take: 20,
      select: { restaurantId: true },
    });
    expect(processMemory.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    expect(await response.json()).toEqual({ processed: 2, results: ["completed", "unchanged"] });
  });

  it("keeps processing after one restaurant fails", async () => {
    db.culinaryMemory.findMany.mockResolvedValue([{ restaurantId: "a" }, { restaurantId: "b" }]);
    processMemory.mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValueOnce("completed");
    expect(await (await GET(request())).json()).toEqual({ processed: 2, results: ["infrastructure_error", "completed"] });
  });

  it("stops starting rows when the deadline margin is exhausted", async () => {
    db.culinaryMemory.findMany.mockResolvedValue([{ restaurantId: "a" }, { restaurantId: "b" }]);
    processMemory.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(+started + CRON_DEADLINE_MS - MINIMUM_ROW_TIME_MS));
      return "completed";
    });
    expect(await (await GET(request())).json()).toEqual({ processed: 1, results: ["completed"] });
    expect(processMemory).toHaveBeenCalledTimes(1);
  });

  it("passes every worker an absolute deadline signal while retaining platform margin", async () => {
    db.culinaryMemory.findMany.mockResolvedValue([{ restaurantId: "a" }]);
    await GET(request());
    const signal = processMemory.mock.calls[0]![4] as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    expect(CRON_DEADLINE_MS).toBeLessThan(300_000);
    expect(CRON_DEADLINE_MS - MINIMUM_ROW_TIME_MS).toBeGreaterThan(0);
  });
});
