import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, ctx } = vi.hoisted(() => ({
  db: { product: { findMany: vi.fn() } },
  ctx: { userId: "u1", restaurantId: "r1", role: "chef_executive" },
}));

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/with-auth", () => ({
  withAuth:
    (
      opts: { body?: { safeParse(v: unknown): { success: boolean; data?: unknown } } },
      handler: (c: unknown, b: unknown, req: NextRequest) => unknown,
    ) =>
    (req: NextRequest) => {
      const raw = JSON.parse(req.headers.get("x-test-body") ?? "{}");
      const parsed = opts.body ? opts.body.safeParse(raw) : { success: true, data: raw };
      if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
      return handler(ctx, parsed.data, req);
    },
}));

import * as route from "../route";

async function match(queries: string[]) {
  const res = await route.POST(
    new NextRequest("https://t.local/api/products/match", {
      method: "POST",
      headers: { "x-test-body": JSON.stringify({ queries }) },
    }),
  );
  return (await res.json()) as { results: Array<{ level: string; productId: string | null }> };
}

beforeEach(() => {
  db.product.findMany.mockReset().mockResolvedValue([
    { id: "monkfish", name: "Rape limpio", aliases: [] },
    { id: "hake", name: "Merluza", aliases: [] },
    { id: "oil", name: "AOVE", aliases: [] },
    { id: "chorizo", name: "Chorizo", aliases: [] },
  ]);
});

describe("POST /api/products/match", () => {
  it("matches the clean name, not the note or its alternatives", async () => {
    const { results } = await match(["400 g rape limpio, muy frío (o merluza)"]);
    expect(results[0]).toMatchObject({ level: "exact", productId: "monkfish" });
  });

  it("ignores a parenthetical section or note after the name", async () => {
    const { results } = await match(["40 g AOVE (aceite de chorizo)"]);
    expect(results[0]).toMatchObject({ level: "exact", productId: "oil" });
  });

  it("matches an unmeasured line by its name", async () => {
    const { results } = await match(["1 cucharada AOVE"]);
    expect(results[0]).toMatchObject({ level: "exact", productId: "oil" });
  });
});
