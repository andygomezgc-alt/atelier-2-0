import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

vi.mock("./permissions-guard", () => ({
  requireAuth: async () => ({ userId: "user-1", role: "admin", restaurantId: "rest-1" }),
  isNextResponse: (value: unknown) => value instanceof NextResponse,
}));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { withAuth } from "./with-auth";

const post = (body: unknown) => new NextRequest("http://localhost/api/example", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("withAuth body validation", () => {
  it("returns 400 invalid_body with the issues and skips the handler", async () => {
    const handler = vi.fn();
    const route = withAuth({ body: z.object({ name: z.string(), count: z.number().int().min(1) }) }, handler);
    const res = await route(post({ name: 1, count: 0 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid_body",
      issues: [
        expect.objectContaining({ code: "invalid_type", path: ["name"], message: "Expected string, received number" }),
        expect.objectContaining({ code: "too_small", path: ["count"], message: "Number must be greater than or equal to 1" }),
      ],
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
