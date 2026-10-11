import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { can, type Permission } from "@atelier/shared";

const h = vi.hoisted(() => ({
  findMany: vi.fn(), create: vi.fn(), findConversation: vi.fn(), findIdea: vi.fn(), updateIdeas: vi.fn(),
  restaurantId: "restaurant-1" as string | null,
  role: "chef_executive" as Parameters<typeof can>[0],
}));
vi.mock("@atelier/db", () => ({ prisma: {
  conversation: { findMany: h.findMany, create: h.create, findUnique: h.findConversation },
  idea: { findUnique: h.findIdea, updateMany: h.updateIdeas },
} }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: vi.fn(async (_req: NextRequest, permission?: Permission) => {
    if (permission && !h.restaurantId)
      return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
    if (permission && !can(h.role, permission))
      return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    return { userId: "chef-1", restaurantId: h.restaurantId, role: h.role };
  }),
  isNextResponse: (value: unknown) => value instanceof NextResponse,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn() } }));
import { GET, POST } from "../route";
import { GET as ideaConversation } from "../../ideas/[id]/conversation/route";
import { POST as bulkMessages } from "../[id]/messages/bulk/route";

const url = "https://atelier.test/api/conversations";
const row = { id: "chat-1", modelUsed: "daily", createdAt: new Date("2026-09-09T10:00:00Z"), idea: null, messages: [] };
beforeEach(() => {
  h.restaurantId = "restaurant-1";
  h.role = "chef_executive";
  h.findMany.mockReset();
  h.create.mockReset();
  h.findConversation.mockReset();
  h.findIdea.mockReset();
  h.updateIdeas.mockReset();
});

describe("conversation history and new chats", () => {
  it("rejects a viewer listing restaurant chats before querying history", async () => {
    h.role = "viewer";
    h.findMany.mockResolvedValue([row]);
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden", code: "forbidden" });
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it("lets a sous-chef list restaurant chats", async () => {
    h.role = "sous_chef";
    h.findMany.mockResolvedValue([row]);
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it("rejects viewers on idea conversations and bulk chat imports", async () => {
    h.role = "viewer";
    const params = { params: Promise.resolve({ id: "idea-1" }) };
    const idea = await ideaConversation(new NextRequest(url), params);
    const bulk = await bulkMessages(new NextRequest(url, { method: "POST" }), params);
    for (const res of [idea, bulk]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden", code: "forbidden" });
    }
  });

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

  const ideaChat = () => new NextRequest(url, { method: "POST", body: JSON.stringify({ ideaId: "idea-1", modelUsed: "daily" }), headers: { "Content-Type": "application/json" } });

  it.each(["sous_chef", "admin"] as const)("does not open a chat on a teammate's idea (%s)", async (role) => {
    h.role = role;
    h.findIdea.mockResolvedValue({ id: "idea-1", restaurantId: "restaurant-1", authorId: "chef-2" });
    h.findConversation.mockResolvedValue({ id: "chat-of-teammate" });
    const res = await POST(ideaChat());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Idea not found" });
    expect(h.findConversation).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.updateIdeas).not.toHaveBeenCalled();
  });

  it("does not start a chat or move a teammate's idea to in_chat when it has none yet", async () => {
    h.findIdea.mockResolvedValue({ id: "idea-1", restaurantId: "restaurant-1", authorId: "chef-2" });
    h.findConversation.mockResolvedValue(null);
    h.create.mockResolvedValue({ id: "chat-new" });
    const res = await POST(ideaChat());
    expect(res.status).toBe(404);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.updateIdeas).not.toHaveBeenCalled();
  });

  it("returns the existing chat of the caller's own idea, or creates it and marks the idea in_chat", async () => {
    h.findIdea.mockResolvedValue({ id: "idea-1", restaurantId: "restaurant-1", authorId: "chef-1" });
    h.findConversation.mockResolvedValueOnce({ id: "chat-existing" }).mockResolvedValueOnce(null);
    h.create.mockResolvedValue({ id: "chat-new" });
    const existing = await POST(ideaChat());
    expect(existing.status).toBe(200);
    expect(await existing.json()).toEqual({ id: "chat-existing" });
    const created = await POST(ideaChat());
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: "chat-new" });
    expect(h.updateIdeas).toHaveBeenCalledWith({ where: { id: "idea-1", restaurantId: "restaurant-1" }, data: { status: "in_chat" } });
  });
});
