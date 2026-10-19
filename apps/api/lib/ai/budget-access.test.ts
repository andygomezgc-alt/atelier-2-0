import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ findUser: vi.fn(), findBudget: vi.fn(), auth: vi.fn() }));
vi.mock("@atelier/db", () => ({ prisma: { user: { findUnique: h.findUser }, aiBudget: { findUnique: h.findBudget } } }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: h.auth, isNextResponse: (r: unknown) => r instanceof Response }));
import { ownerBudgetStatus, isAiOwner } from "./budget";
import { pilotEnd } from "./budget-policy";
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
    expect(await ownerBudgetStatus("owner")).toMatchObject({ limit: 187.5, used: 0, reserved: 0, endsAt: null });
  });
  it("reports an ended period as the renewed one, not as blocked", async () => {
    h.findUser.mockResolvedValue({ email: "andygomezgc@gmail.com" });
    const endsAt = new Date(Date.now() - 1000);
    h.findBudget.mockResolvedValue({ limitMicros: 187_500_000, spentMicros: 150_000_000, heldMicros: 1_000_000, startsAt: new Date(+endsAt - 86_400_000), endsAt, warnedAt: new Date(), blockedAt: null });
    expect(await ownerBudgetStatus("owner")).toEqual({ limit: 187.5, used: 0, reserved: 1, endsAt: pilotEnd(endsAt).toISOString(), warning: false, blocked: false });
    // A blocked row never renews, so it keeps reporting the period it stopped in.
    h.findBudget.mockResolvedValue({ limitMicros: 187_500_000, spentMicros: 1_000_000, heldMicros: 0, startsAt: new Date(+endsAt - 86_400_000), endsAt, warnedAt: null, blockedAt: new Date() });
    expect(await ownerBudgetStatus("owner")).toMatchObject({ used: 1, endsAt: endsAt.toISOString(), blocked: true });
  });
  it("requires authentication and ignores spoofed email query parameters", async () => {
    h.auth.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    expect((await GET({} as never)).status).toBe(401); expect(h.findUser).not.toHaveBeenCalled();
    h.auth.mockResolvedValue({ userId: "other-chef", role: "admin" }); h.findUser.mockResolvedValue({ email: "chef@example.test" });
    const response = await GET(new Request("https://example.test/api/ai-budget?email=andygomezgc@gmail.com") as never);
    expect(await response.json()).toEqual({ budget: null }); expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
