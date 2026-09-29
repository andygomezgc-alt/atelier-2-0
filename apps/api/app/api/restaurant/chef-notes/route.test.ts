import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { can } from "@atelier/shared";
import type { Role } from "@atelier/db";
const { auth, db, KnownRequestError } = vi.hoisted(() => {
  class KnownRequestError extends Error { constructor(public code: string) { super(code); } }
  const chefNote = { findMany: vi.fn(), count: vi.fn(), create: vi.fn() };
  return { auth: vi.fn(), db: { chefNote, $transaction: vi.fn() }, KnownRequestError };
});
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: auth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@atelier/db", () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: KnownRequestError } }));
import { GET, POST } from "./route";
const url = "http://local/api/restaurant/chef-notes";
const post = (body: unknown, headers: Record<string, string> = { authorization: "Bearer test" }) =>
  new NextRequest(url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const created = new Date("2026-09-29T10:00:00.000Z");
let role: Role;
beforeEach(() => {
  vi.resetAllMocks();
  role = "chef_executive";
  // La matriz de permisos es la real: solo cambia quién llama.
  auth.mockImplementation(async (_req: unknown, permission: Parameters<typeof can>[1]) =>
    can(role, permission) ? { restaurantId: "mine", role, userId: "u1" } : NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 }));
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db));
  db.chefNote.findMany.mockResolvedValue([]);
  db.chefNote.count.mockResolvedValue(0);
  db.chefNote.create.mockImplementation(async ({ data }: { data: { text: string } }) => ({ id: "n1", text: data.text, createdAt: created }));
});
describe("GET /api/restaurant/chef-notes", () => {
  it("lista las notas del restaurante autenticado en orden de creación", async () => {
    db.chefNote.findMany.mockResolvedValue([
      { id: "a", text: "No usamos cerdo", createdAt: created },
      { id: "b", text: "Horno de leña", createdAt: new Date("2026-09-29T11:00:00.000Z") },
    ]);
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notes: [
        { id: "a", text: "No usamos cerdo", createdAt: "2026-09-29T10:00:00.000Z" },
        { id: "b", text: "Horno de leña", createdAt: "2026-09-29T11:00:00.000Z" },
      ],
      canEdit: true,
    });
    expect(auth).toHaveBeenCalledWith(expect.anything(), "capture_idea");
    const query = db.chefNote.findMany.mock.calls[0]![0];
    expect(query.where).toEqual({ restaurantId: "mine" });
    expect(query.orderBy).toEqual({ createdAt: "asc" });
    expect(query.select).toEqual({ id: true, text: true, createdAt: true });
  });
  it.each<[Role, boolean]>([["admin", true], ["chef_executive", true], ["sous_chef", false]])("canEdit de %s es %s", async (r, canEdit) => {
    role = r;
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect((await response.json()).canEdit).toBe(canEdit);
  });
  it("el lector no accede", async () => {
    role = "viewer";
    expect((await GET(new NextRequest(url))).status).toBe(403);
    expect(db.chefNote.findMany).not.toHaveBeenCalled();
  });
  it("sin restaurante responde 403", async () => {
    auth.mockResolvedValue({ restaurantId: null, role: "chef_executive", userId: "u1" });
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Not in a restaurant" });
    expect(db.chefNote.findMany).not.toHaveBeenCalled();
  });
});
describe("POST /api/restaurant/chef-notes", () => {
  it("crea la nota recortada en el restaurante autenticado y responde 201", async () => {
    const response = await POST(post({ text: "  No usamos cerdo  " }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "n1", text: "No usamos cerdo", createdAt: "2026-09-29T10:00:00.000Z" });
    expect(auth).toHaveBeenCalledWith(expect.anything(), "approve_recipe");
    expect(db.chefNote.count).toHaveBeenCalledWith({ where: { restaurantId: "mine" } });
    expect(db.chefNote.create.mock.calls[0]![0].data).toEqual({ restaurantId: "mine", text: "No usamos cerdo" });
  });
  it("cuenta y crea dentro de una transacción serializable", async () => {
    await POST(post({ text: "Horno de leña" }));
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.$transaction.mock.calls[0]![1]).toEqual({ isolationLevel: "Serializable" });
  });
  it("con 9 notas todavía crea la décima", async () => {
    db.chefNote.count.mockResolvedValue(9);
    expect((await POST(post({ text: "Décima" }))).status).toBe(201);
  });
  it("la nota 11 responde 409 chef_notes_limit sin crear nada", async () => {
    db.chefNote.count.mockResolvedValue(10);
    const response = await POST(post({ text: "Undécima" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Ya hay 10 notas. Borra alguna para añadir otra.", code: "chef_notes_limit" });
    expect(db.chefNote.create).not.toHaveBeenCalled();
  });
  it("reintenta cuando otra petición simultánea provoca un conflicto de serialización", async () => {
    db.$transaction.mockRejectedValueOnce(new KnownRequestError("P2034"));
    expect((await POST(post({ text: "Otra vez" }))).status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });
  it("no oculta otros errores de la base", async () => {
    db.$transaction.mockRejectedValue(new KnownRequestError("P2002"));
    await expect(POST(post({ text: "Falla" }))).rejects.toThrow("P2002");
    expect(db.$transaction).toHaveBeenCalledOnce();
  });
  it("deja de reintentar tras tres conflictos", async () => {
    db.$transaction.mockRejectedValue(new KnownRequestError("P2034"));
    await expect(POST(post({ text: "Siempre choca" }))).rejects.toThrow("P2034");
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });
  it.each([
    ["vacío", { text: "" }],
    ["solo espacios", { text: "   \n " }],
    ["más de 160 caracteres", { text: "a".repeat(161) }],
    ["sin texto", {}],
    ["texto que no es cadena", { text: 5 }],
    ["un restaurante enviado por el cliente", { text: "ok", restaurantId: "other" }],
    ["JSON inválido", "{no es json"],
  ])("rechaza con 400: %s", async (_label, body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("acepta 160 caracteres exactos", async () => {
    expect((await POST(post({ text: "a".repeat(160) }))).status).toBe(201);
  });
  it.each<Role>(["sous_chef", "viewer"])("%s no puede crear notas", async r => {
    role = r;
    expect((await POST(post({ text: "Nota" }))).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("sin restaurante responde 403", async () => {
    auth.mockResolvedValue({ restaurantId: null, role: "chef_executive", userId: "u1" });
    expect((await POST(post({ text: "Nota" }))).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rechaza escrituras web de otro origen y acepta las del propio", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://atelier.test");
    try {
      expect((await POST(post({ text: "Nota" }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
      expect((await POST(post({ text: "Nota" }, { origin: "https://foreign.test" }))).status).toBe(403);
      expect(db.$transaction).not.toHaveBeenCalled();
      expect((await POST(post({ text: "Nota" }, { origin: "https://atelier.test" }))).status).toBe(201);
    } finally { vi.unstubAllEnvs(); }
  });
});
