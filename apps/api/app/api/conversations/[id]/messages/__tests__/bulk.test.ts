import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { can, type Permission } from "@atelier/shared";
import * as route from "../bulk/route";

const h = vi.hoisted(() => ({
  conversation: null as null | { id: string; restaurantId: string; authorId: string },
  rows: [] as Array<Record<string, unknown>>,
  restaurantId: "restaurant-1" as string | null,
  userId: "chef-1",
  role: "chef_executive" as Parameters<typeof can>[0],
  createMany: vi.fn(),
}));
vi.mock("@atelier/db", () => {
  const db: Record<string, unknown> = {
    conversation: { findUnique: vi.fn(async () => h.conversation) },
    message: { createMany: h.createMany },
  };
  db.$transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(db));
  return { prisma: db };
});
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: vi.fn(async (_req: NextRequest, permission?: Permission) => {
    if (permission && !h.restaurantId)
      return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
    if (permission && !can(h.role, permission))
      return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    return { userId: h.userId, restaurantId: h.restaurantId, role: h.role };
  }),
  isNextResponse: (value: unknown) => value instanceof NextResponse,
}));

// Mirrors Prisma's createMany against @@unique([conversationId, clientMessageId]):
// a duplicate throws unless skipDuplicates is set, and the result reports inserted rows.
function insertRows(data: Array<Record<string, unknown>>, skipDuplicates = false) {
  let count = 0;
  for (const row of data) {
    const duplicate = row.clientMessageId !== undefined && h.rows.some((stored) =>
      stored.conversationId === row.conversationId && stored.clientMessageId === row.clientMessageId);
    if (duplicate) {
      if (skipDuplicates) continue;
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    }
    h.rows.push(row);
    count++;
  }
  return { count };
}

const batch = [
  { role: "user", content: "Primera pregunta", clientMessageId: "cm-1" },
  { role: "assistant", content: "Primera respuesta", clientMessageId: "cm-1-reply" },
  { role: "user", content: "Segunda pregunta", clientMessageId: "cm-2" },
  { role: "assistant", content: "Segunda respuesta", clientMessageId: "cm-2-reply" },
];
const post = (messages: unknown, id = "conv-1") => route.POST(
  new NextRequest(`https://atelier.test/api/conversations/${id}/messages/bulk`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages }),
  }),
  { params: Promise.resolve({ id }) },
);

beforeEach(() => {
  h.conversation = { id: "conv-1", restaurantId: "restaurant-1", authorId: "chef-1" };
  h.restaurantId = "restaurant-1";
  h.userId = "chef-1";
  h.role = "chef_executive";
  h.rows = [];
  h.createMany.mockReset();
  h.createMany.mockImplementation(async ({ data, skipDuplicates }: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) =>
    insertRows(data, skipDuplicates));
});

describe("bulk message import (A10)", () => {
  it("stores the batch in client order with strictly increasing timestamps", async () => {
    const res = await post(batch);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inserted: 4 });
    const data = h.createMany.mock.calls[0]![0].data as Array<{ content: string; createdAt?: Date }>;
    expect(data.map((row) => row.content)).toEqual(batch.map((message) => message.content));
    const stamps = data.map((row) => row.createdAt?.getTime() ?? Number.NaN);
    expect(stamps).toHaveLength(4);
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]).toBeGreaterThan(stamps[i - 1]!);
  });

  it("replaying the same batch inserts nothing new", async () => {
    expect(await (await post(batch)).json()).toEqual({ inserted: 4 });
    const replay = await post(batch);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ inserted: 0 });
    expect(h.rows).toHaveLength(4);
  });

  it("a retry after a partial insert stores only the messages not stored yet", async () => {
    expect(await (await post(batch.slice(0, 2))).json()).toEqual({ inserted: 2 });
    expect(await (await post(batch)).json()).toEqual({ inserted: 2 });
    expect(h.rows.map((row) => row.content)).toEqual(batch.map((message) => message.content));
  });

  it("requires the conversation author or an admin, like the stop route", async () => {
    h.conversation = { id: "conv-1", restaurantId: "restaurant-1", authorId: "chef-2" };
    const denied = await post(batch);
    expect(denied.status).toBe(403);
    expect(h.createMany).not.toHaveBeenCalled();

    h.role = "admin";
    expect((await post(batch)).status).toBe(200);
    expect(h.rows).toHaveLength(4);
  });

  it("rejects another restaurant's conversation without writing", async () => {
    h.conversation = { id: "conv-1", restaurantId: "restaurant-2", authorId: "chef-1" };
    expect((await post(batch)).status).toBe(404);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("accepts only user and assistant roles, and bounds the count and length of each message", async () => {
    expect((await post([{ role: "system", content: "x" }])).status).toBe(400);
    expect((await post(Array.from({ length: 41 }, (_, i) => ({ role: "user", content: `m${i}` })))).status).toBe(400);
    expect((await post([{ role: "user", content: "a".repeat(20_001) }])).status).toBe(400);
    expect(h.createMany).not.toHaveBeenCalled();
  });
});
