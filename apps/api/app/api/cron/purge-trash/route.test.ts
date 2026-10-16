import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { purgeExpiredTrash, purgeExpiredInvoices, logger } = vi.hoisted(() => ({ purgeExpiredTrash: vi.fn(), purgeExpiredInvoices: vi.fn(), logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/trash-purge", () => ({ purgeExpiredTrash }));
vi.mock("@/lib/invoices/purge", () => ({ purgeExpiredInvoices }));
vi.mock("@/lib/logger", () => ({ logger }));

import { GET } from "./route";

const counts = { menus: 1, menuItems: 2, recipes: 3, products: 4, complete: true, failed: { menus: 0, recipes: 1, products: 0 }, aborted: [] };
const started = new Date("2026-10-13T03:30:00Z");
const request = (authorization?: string) => new NextRequest("https://local/api/cron/purge-trash", {
  headers: authorization === undefined ? {} : { authorization },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(started);
  vi.stubEnv("CRON_SECRET", "secret");
  vi.clearAllMocks();
  purgeExpiredTrash.mockResolvedValue(counts);
  purgeExpiredInvoices.mockResolvedValue({ invoices: 1, files: 2, failed: 0, complete: true });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("purge trash cron", () => {
  it("rejects a missing or wrong secret before purging anything", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer "))).status).toBe(401);
    expect(purgeExpiredTrash).not.toHaveBeenCalled();
  });

  it("purges with the current time and returns the counts", async () => {
    const response = await GET(request("Bearer secret"));

    expect(response.status).toBe(200);
    // Rows skipped by the purge are reported, not turned into an error.
    expect(await response.json()).toEqual({ ...counts, invoices: { invoices: 1, files: 2, failed: 0, complete: true } });
    expect(purgeExpiredTrash).toHaveBeenCalledOnce();
    expect(purgeExpiredTrash.mock.calls[0]![0]).toEqual(started);
  });

  it("an invoice purge crash still returns the trash result", async () => {
    purgeExpiredInvoices.mockRejectedValue(new Error("blob down"));
    const response = await GET(request("Bearer secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...counts, invoices: null });
  });

  it("answers 500 and logs when the purge fails outside its own handling", async () => {
    purgeExpiredTrash.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(request("Bearer secret"));

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith("trash_purge_crashed", expect.objectContaining({ message: "database unavailable" }));
  });
});
