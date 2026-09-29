import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const { auth, get, patch, after, processMemory, providerConfig, generateMemory, logger } = vi.hoisted(() => ({
  auth: vi.fn(), get: vi.fn(), patch: vi.fn(), after: vi.fn(), processMemory: vi.fn(), providerConfig: vi.fn(),
  generateMemory: vi.fn(), logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("next/server", async importOriginal => ({ ...(await importOriginal<typeof import("next/server")>()), after }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: auth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/culinary-memory/service", () => ({ getCulinaryMemory: get, patchCulinaryMemory: patch, MemoryConflict: class extends Error {} }));
vi.mock("@/lib/culinary-memory/worker", () => ({ processMemory }));
vi.mock("@/lib/culinary-memory/provider", () => ({ memoryProviderConfig: providerConfig, generateMemory }));
vi.mock("@/lib/logger", () => ({ logger }));
import { GET, PATCH, DELETE, maxDuration } from "./route";
import { MINIMUM_ROW_TIME_MS } from "@/lib/culinary-memory/scheduling";
const req = (body: unknown, method = "PATCH", headers = {}) => new NextRequest("http://local/api/restaurant/culinary-memory", { method, headers: { authorization: "Bearer test", ...headers }, body: JSON.stringify(body) });
const config = { provider: "fixture", model: "test" };
/** Ejecuta lo que la ruta dejó para después de responder, como hace Next. */
const runAfter = async () => { for (const [task] of after.mock.calls) await (task as () => Promise<unknown>)(); };
beforeEach(() => {
  vi.clearAllMocks(); auth.mockResolvedValue({ restaurantId: "mine", role: "chef_executive", userId: "u1" }); get.mockResolvedValue({ enabled: false });
  patch.mockResolvedValue({ memory: { enabled: true }, turnedOn: false }); providerConfig.mockReturnValue(config); processMemory.mockResolvedValue("completed");
});
describe("culinary memory route", () => {
  it("usa el restaurante autenticado, nunca uno recibido del cliente", async () => {
    const response = await PATCH(req({ expectedVersion: 0, enabled: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
    expect(patch).toHaveBeenCalledWith("mine", { expectedVersion: 0, enabled: true }, false);
    expect((await PATCH(req({ expectedVersion: 0, restaurantId: "other" }))).status).toBe(400);
  });
  it("aplica permisos de consulta y edición", async () => {
    auth.mockResolvedValueOnce({ restaurantId: "mine", role: "sous_chef" });
    await GET(new NextRequest("http://local")); expect(get).toHaveBeenCalledWith("mine", false);
    expect(auth).toHaveBeenCalledWith(expect.anything(), "capture_idea");
    auth.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    expect((await PATCH(req({ expectedVersion: 0 }))).status).toBe(403); expect(patch).not.toHaveBeenCalled();
    expect(auth).toHaveBeenLastCalledWith(expect.anything(), "approve_recipe");
  });
  it("borrar exige versión y utiliza la misma protección de concurrencia", async () => {
    expect((await DELETE(req({ expectedVersion: 3 }, "DELETE"))).status).toBe(200);
    expect(patch).toHaveBeenCalledWith("mine", { expectedVersion: 3 }, true);
    expect((await DELETE(req({}, "DELETE"))).status).toBe(400);
  });
  it("rechaza escrituras web de otro origen", async () => {
    expect((await PATCH(req({ expectedVersion: 0 }, "PATCH", { authorization: "", origin: "https://foreign.test" }))).status).toBe(403);
    expect(patch).not.toHaveBeenCalled();
  });
});
describe("aprender al encender la memoria", () => {
  it("al encenderla lanza una corrida del restaurante después de responder", async () => {
    patch.mockResolvedValue({ memory: { enabled: true }, turnedOn: true });
    const response = await PATCH(req({ expectedVersion: 0, enabled: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
    expect(after).toHaveBeenCalledOnce();
    expect(processMemory).not.toHaveBeenCalled();
    await runAfter();
    expect(processMemory).toHaveBeenCalledOnce();
    expect(processMemory).toHaveBeenCalledWith("mine", generateMemory, config, expect.any(Date), expect.any(AbortSignal));
    expect((processMemory.mock.calls[0]![4] as AbortSignal).aborted).toBe(false);
    expect(logger.info).toHaveBeenCalledWith("culinary_memory_enable_run", expect.objectContaining({ restaurantId: "mine", result: "completed" }));
  });
  it.each([
    ["ya estaba encendida", { expectedVersion: 0, enabled: true }],
    ["solo cambia la identidad", { expectedVersion: 0, identityLine: "Cocina de mercado" }],
    ["solo cambia correcciones", { expectedVersion: 0, corrections: [{ key: "techniques", text: "Al vapor" }] }],
  ])("no aprende cuando %s", async (_label, body) => {
    patch.mockResolvedValue({ memory: { enabled: true }, turnedOn: false });
    expect((await PATCH(req(body))).status).toBe(200);
    await runAfter();
    expect(after).not.toHaveBeenCalled();
    expect(processMemory).not.toHaveBeenCalled();
  });
  it("borrar la memoria no aprende", async () => {
    patch.mockResolvedValue({ memory: { enabled: false }, turnedOn: false });
    expect((await DELETE(req({ expectedVersion: 3 }, "DELETE"))).status).toBe(200);
    expect(after).not.toHaveBeenCalled();
    expect(processMemory).not.toHaveBeenCalled();
  });
  it("un fallo de la corrida no cambia la respuesta y queda registrado", async () => {
    patch.mockResolvedValue({ memory: { enabled: true }, turnedOn: true });
    const failure = new Error("database unavailable");
    processMemory.mockRejectedValue(failure);
    const response = await PATCH(req({ expectedVersion: 0, enabled: true }));
    expect(response.status).toBe(200);
    await expect(runAfter()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("culinary_memory_enable_run_failed", expect.objectContaining({ restaurantId: "mine", error: failure }));
  });
  it("sin proveedor configurado no aprende", async () => {
    patch.mockResolvedValue({ memory: { enabled: true }, turnedOn: true });
    providerConfig.mockReturnValue(null);
    expect((await PATCH(req({ expectedVersion: 0, enabled: true }))).status).toBe(200);
    await runAfter();
    expect(after).not.toHaveBeenCalled();
    expect(processMemory).not.toHaveBeenCalled();
  });
  it("la función dura lo bastante para una corrida y su margen final", () => {
    expect(maxDuration * 1000).toBeGreaterThanOrEqual(MINIMUM_ROW_TIME_MS + 30_000);
    expect(maxDuration).toBeLessThanOrEqual(300);
  });
});
