import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@atelier/db", () => ({
  prisma: {
    verificationToken: {
      deleteMany: mocks.deleteMany,
      create: mocks.create,
    },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  mocks.create.mockResolvedValue({});
  mocks.transaction.mockResolvedValue([]);
});

describe("POST /api/mobile/auth/apple/nonce", () => {
  it("stores only a five-minute hash and returns a no-store challenge", async () => {
    const before = Date.now();
    const response = await POST(
      new NextRequest("https://test.local/api/mobile/auth/apple/nonce", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.8" },
      }),
    );
    const after = Date.now();
    const body = (await response.json()) as { nonce: string; state: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(body.state).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(body.state).not.toBe(body.nonce);

    const createCall = mocks.create.mock.calls[0]?.[0];
    expect(createCall.data.identifier).toBe("apple-auth-nonce");
    expect(createCall.data.token).toBe(
      createHash("sha256").update(body.nonce).digest("hex"),
    );
    expect(createCall.data.token).not.toContain(body.nonce);
    expect(createCall.data.expires.getTime()).toBeGreaterThanOrEqual(
      before + 5 * 60 * 1000,
    );
    expect(createCall.data.expires.getTime()).toBeLessThanOrEqual(
      after + 5 * 60 * 1000,
    );
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});
