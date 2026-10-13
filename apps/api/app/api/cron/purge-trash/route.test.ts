import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { purgeExpiredTrash } = vi.hoisted(() => ({ purgeExpiredTrash: vi.fn() }));
vi.mock("@/lib/trash-purge", () => ({ purgeExpiredTrash }));

import { GET } from "./route";

const started = new Date("2026-10-13T03:30:00Z");
const request = (authorization?: string) => new NextRequest("https://local/api/cron/purge-trash", {
  headers: authorization === undefined ? {} : { authorization },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(started);
  vi.stubEnv("CRON_SECRET", "secret");
  vi.clearAllMocks();
  purgeExpiredTrash.mockResolvedValue({ menus: 1, menuItems: 2, recipes: 3, products: 4, complete: true });
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
    expect(await response.json()).toEqual({ menus: 1, menuItems: 2, recipes: 3, products: 4, complete: true });
    expect(purgeExpiredTrash).toHaveBeenCalledOnce();
    expect(purgeExpiredTrash.mock.calls[0]![0]).toEqual(started);
  });
});
