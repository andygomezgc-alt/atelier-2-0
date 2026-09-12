import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  findMany: vi.fn(), create: vi.fn(), restaurantId: "restaurant-1" as string | null,
}));
vi.mock("@atelier/db", () => ({ prisma: { conversation: { findMany: h.findMany, create: h.create } } }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: vi.fn(async () => ({ userId: "chef-1", restaurantId: h.restaurantId })),
  isNextResponse: (value: unknown) => value instanceof NextResponse,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn() } }));
import { GET, POST } from "../route";

const url = "https://atelier.test/api/conversations";
const row = { id: "chat-1", modelUsed: "daily", createdAt: new Date("2026-09-09T10:00:00Z"), idea: null, messages: [] };
beforeEach(() => {
  h.restaurantId = "restaurant-1";
  h.findMany.mockReset();
  h.create.mockReset();
});

describe("conversation history and new chats", () => {
  it("names an unanchored chat with its first message, without returning the full conversation", async () => {
    h.findMany.mockResolvedValue([{ ...row, messages: [{ content: "  Un menú\n de otoño  " }] }]);
    const res = await GET(new NextRequest(url));
    expect(await res.json()).toEqual([{ id: "chat-1", modelUsed: "daily", ideaText: null, title: "Un menú de otoño", createdAt: row.createdAt.toISOString() }]);
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: "restaurant-1" }, take: 50,
      include: expect.objectContaining({ messages: { where: { role: "user" }, orderBy: { createdAt: "asc" }, take: 1, select: { content: true } } }),
    }));
  });

  it("preserves an anchored idea as the title and returns only a short preview", async () => {
    h.findMany.mockResolvedValue([
      { ...row, idea: { text: "Berenjena asada" }, messages: [{ content: "Ayúdame" }] },
      { ...row, id: "chat-2", messages: [{ content: "a".repeat(300) }] },
    ]);
    const data = await (await GET(new NextRequest(url))).json();
    expect(data[0].title).toBe("Berenjena asada");
    expect(data[0].ideaText).toBe("Berenjena asada");
    expect(data[1].title).toHaveLength(140);
  });

  it("handles empty chats and does not expose another restaurant's history to a preview user", async () => {
    h.findMany.mockResolvedValue([row]);
    expect((await (await GET(new NextRequest(url))).json())[0].title).toBeNull();
    h.findMany.mockClear();
    h.restaurantId = null;
    expect((await GET(new NextRequest(url))).status).toBe(403);
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it("creates independent chats when no idea is attached", async () => {
    h.create.mockResolvedValueOnce({ id: "chat-1" }).mockResolvedValueOnce({ id: "chat-2" });
    const request = () => new NextRequest(url, { method: "POST", body: JSON.stringify({ ideaId: null, modelUsed: "daily" }), headers: { "Content-Type": "application/json" } });
    const first = await POST(request());
    const second = await POST(request());
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ id: "chat-1" });
    expect(await second.json()).toEqual({ id: "chat-2" });
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.create).toHaveBeenLastCalledWith({ data: { restaurantId: "restaurant-1", authorId: "chef-1", modelUsed: "daily", ideaId: null } });
  });
});
