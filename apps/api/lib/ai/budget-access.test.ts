import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ findUser: vi.fn(), findBudget: vi.fn(), auth: vi.fn() }));
vi.mock("@atelier/db", () => ({ prisma: { user: { findUnique: h.findUser }, aiBudget: { findUnique: h.findBudget } } }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: h.auth, isNextResponse: (r: unknown) => r instanceof Response }));
import { ownerBudgetStatus, isAiOwner } from "./budget";
import { GET } from "../../app/api/ai-budget/route";
beforeEach(() => { vi.resetAllMocks(); });
describe("private owner allowance", () => {
  it("resolves the exemption from the server record, irrespective of restaurant role", async () => {
    h.findUser.mockResolvedValue({ email: "ANDYGOMEZGC@gmail.com" });
    expect(await isAiOwner("authenticated-id")).toBe(true);
    expect(h.findUser).toHaveBeenCalledWith({ where: { id: "authenticated-id" }, select: { email: true } });
    h.findUser.mockResolvedValue({ email: "admin@example.test", role: "admin" });
    expect(await isAiOwner("other-admin")).toBe(false);
  });
  it("does not read or reveal spending to another chef", async () => {
    h.findUser.mockResolvedValue({ email: "chef@example.test" });
    expect(await ownerBudgetStatus("chef")).toBeNull(); expect(h.findBudget).not.toHaveBeenCalled();
  });
  it("shows unused allowance without starting a pilot or creating a row", async () => {
    h.findUser.mockResolvedValue({ email: "andygomezgc@gmail.com" }); h.findBudget.mockResolvedValue(null);
    expect(await ownerBudgetStatus("owner")).toMatchObject({ limit: 50, used: 0, reserved: 0, endsAt: null });
  });
  it("requires authentication and ignores spoofed email query parameters", async () => {
    h.auth.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    expect((await GET({} as never)).status).toBe(401); expect(h.findUser).not.toHaveBeenCalled();
    h.auth.mockResolvedValue({ userId: "other-chef", role: "admin" }); h.findUser.mockResolvedValue({ email: "chef@example.test" });
    const response = await GET(new Request("https://example.test/api/ai-budget?email=andygomezgc@gmail.com") as never);
    expect(await response.json()).toEqual({ budget: null }); expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
