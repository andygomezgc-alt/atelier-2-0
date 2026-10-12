import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { can } from "@atelier/shared";
import { DELETE } from "../route";

interface Conversation {
  id: string;
  restaurantId: string;
  authorId: string;
  ideaId: string | null;
  idea: { authorId: string } | null;
}

const h = vi.hoisted(() => ({
  auth: { userId: "u1", restaurantId: "r1" as string | null, role: "sous_chef" as Parameters<typeof can>[0] },
  guardResponse: null as Response | null,
  conversation: null as Conversation | null,
  findUnique: vi.fn(),
  remove: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("@atelier/db", () => ({ prisma: { conversation: { findUnique: h.findUnique, delete: h.remove } } }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: h.requireAuth,
  isNextResponse: (value: unknown) => value instanceof Response,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const remove = (id = "conv-1") => DELETE(
  new NextRequest(`https://atelier.test/api/conversations/${id}`, { method: "DELETE" }),
  { params: Promise.resolve({ id }) },
);

beforeEach(() => {
  h.auth = { userId: "u1", restaurantId: "r1", role: "sous_chef" };
  h.guardResponse = null;
  h.conversation = { id: "conv-1", restaurantId: "r1", authorId: "u1", ideaId: null, idea: null };
  h.requireAuth.mockReset().mockImplementation(async () => h.guardResponse ?? { ...h.auth });
  h.findUnique.mockReset().mockImplementation(async ({ where }: { where: { id: string } }) =>
    h.conversation && where.id === h.conversation.id ? { ...h.conversation } : null);
  h.remove.mockReset().mockResolvedValue({ id: "conv-1" });
});

describe("DELETE /api/conversations/[id]", () => {
  // ideaAuthorId null = shared chat (no idea); otherwise the chat was born from an idea by that author.
  it.each([
    { who: "the author of a shared chat", role: "sous_chef", authorId: "u1", ideaAuthorId: null },
    { who: "an admin on a shared chat opened by someone else", role: "admin", authorId: "u2", ideaAuthorId: null },
    { who: "the author of a chat born from someone else's idea", role: "sous_chef", authorId: "u1", ideaAuthorId: "u2" },
    { who: "the idea's author on a legacy chat a teammate opened", role: "sous_chef", authorId: "u2", ideaAuthorId: "u1" },
    { who: "an admin on a chat born from someone else's idea", role: "admin", authorId: "u2", ideaAuthorId: "u2" },
  ] as const)("lets $who delete it", async ({ role, authorId, ideaAuthorId }) => {
    h.auth.role = role;
    h.conversation = { id: "conv-1", restaurantId: "r1", authorId, ideaId: ideaAuthorId ? "idea-1" : null, idea: ideaAuthorId ? { authorId: ideaAuthorId } : null };
    const res = await remove();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.remove.mock.calls[0]![0]).toEqual({ where: { id: "conv-1" } });
  });

  it.each(["sous_chef", "chef_executive"] as const)(
    "forbids a %s teammate who can see a shared chat from deleting it",
    async (role) => {
      h.auth.role = role;
      h.conversation = { id: "conv-1", restaurantId: "r1", authorId: "u2", ideaId: null, idea: null };
      const res = await remove();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
      expect(h.remove).not.toHaveBeenCalled();
    },
  );

  it.each(["sous_chef", "chef_executive"] as const)(
    "hides a chat born from a teammate's idea from a %s with 404 and does not delete it",
    async (role) => {
      h.auth.role = role;
      h.conversation = { id: "conv-1", restaurantId: "r1", authorId: "u2", ideaId: "idea-1", idea: { authorId: "u2" } };
      const res = await remove();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
      expect(h.remove).not.toHaveBeenCalled();
    },
  );

  it("returns 404 for a missing conversation", async () => {
    const res = await remove("missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("returns 404 for another restaurant's conversation, even to its author or an admin", async () => {
    h.conversation = { id: "conv-1", restaurantId: "r2", authorId: "u1", ideaId: null, idea: null };
    expect((await remove()).status).toBe(404);
    h.auth.role = "admin";
    expect((await remove()).status).toBe(404);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("returns 403 without a restaurant and does not read or delete", async () => {
    h.auth.restaurantId = null;
    const res = await remove();
    expect(res.status).toBe(403);
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("returns the auth guard's response untouched and requires no extra permission", async () => {
    h.guardResponse = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const res = await remove();
    expect(res.status).toBe(401);
    expect(h.requireAuth).toHaveBeenCalledWith(expect.any(NextRequest));
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });
});
