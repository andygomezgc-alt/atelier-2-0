import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  ctx: { restaurantId: "restaurant-a", userId: "chef-a" },
  create: vi.fn(), transaction: vi.fn(), receiptFind: vi.fn(), receiptCreate: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: {
  idea: { create: h.create }, $transaction: h.transaction,
  ideaCreateReceipt: { findUnique: h.receiptFind, create: h.receiptCreate },
} }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: async () => h.ctx,
  isNextResponse: (value: unknown) => value instanceof NextResponse,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/projections", () => ({ ideaInclude: {}, projectIdea: (idea: unknown) => idea }));
import { POST } from "../route";

const body = { text: "Berenjena con yogur", clientRequestId: "attempt-1", expectedRestaurantId: "restaurant-a", expectedAuthorId: "chef-a" };
const request = (data: Record<string, unknown> = body) => new NextRequest("https://atelier.test/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
beforeEach(() => {
  vi.resetAllMocks();
  h.ctx = { restaurantId: "restaurant-a", userId: "chef-a" };
  let counter = 0;
  h.create.mockImplementation(async ({ data }) => ({ ...data, id: `idea-${++counter}`, status: "open" }));
  h.transaction.mockImplementation(async (fn) => fn({ idea: { create: h.create }, ideaCreateReceipt: { findUnique: h.receiptFind, create: h.receiptCreate } }));
  const receipts = new Map<string, unknown>();
  const key = (value: unknown) => JSON.stringify(value);
  h.receiptFind.mockImplementation(async ({ where }) => receipts.get(key(where.restaurantId_authorId_clientRequestId)) ?? null);
  h.receiptCreate.mockImplementation(async ({ data }) => {
    const receipt = { ...data, idea: await h.create.mock.results.at(-1)?.value };
    receipts.set(key({ restaurantId: data.restaurantId, authorId: data.authorId, clientRequestId: data.clientRequestId }), receipt);
    return receipt;
  });
});

describe("retryable idea creation", () => {
  it("replays the same save instead of creating another idea", async () => {
    const first = await POST(request());
    const retry = await POST(request());
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect((await retry.json()).id).toBe((await first.json()).id);
    expect(h.create).toHaveBeenCalledOnce();
  });
  it("rejects a delayed request when the chef has switched restaurant", async () => {
    h.ctx.restaurantId = "restaurant-b";
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("rejects a delayed request sent under a different user", async () => {
    h.ctx.userId = "chef-b";
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("idea_owner_changed");
    expect(h.create).not.toHaveBeenCalled();
  });
  it("accepts installed clients that do not send a request ID", async () => {
    expect((await POST(request({ text: body.text }))).status).toBe(201);
    expect(h.receiptCreate).not.toHaveBeenCalled();
  });
  it("allows the chef to deliberately save identical text as a new idea", async () => {
    await POST(request());
    expect((await POST(request({ ...body, clientRequestId: "attempt-2" }))).status).toBe(201);
    expect(h.create).toHaveBeenCalledTimes(2);
  });
  it("rejects reuse of a request ID with different content", async () => {
    await POST(request());
    const response = await POST(request({ ...body, text: "Otra idea" }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("idea_save_conflict");
    expect(h.create).toHaveBeenCalledOnce();
  });
  it("scopes request IDs by both restaurant and author", async () => {
    await POST(request());
    h.ctx.userId = "chef-b";
    expect((await POST(request({ ...body, expectedAuthorId: "chef-b" }))).status).toBe(201);
    h.ctx.restaurantId = "restaurant-b";
    expect((await POST(request({ ...body, expectedAuthorId: "chef-b", expectedRestaurantId: "restaurant-b" }))).status).toBe(201);
    expect(h.create).toHaveBeenCalledTimes(3);
  });
  it.each(["", "   ", "a".repeat(2001)])("rejects invalid text without writing", async (text) => {
    expect((await POST(request({ ...body, text }))).status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("normalizes whitespace before comparing retry content", async () => {
    await POST(request({ ...body, text: `  ${body.text}  ` }));
    expect((await POST(request())).status).toBe(200);
    expect(h.create).toHaveBeenCalledOnce();
  });
});
