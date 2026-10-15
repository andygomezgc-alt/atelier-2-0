// apps/api/app/api/invoices/__tests__/apply-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { guard, apply } = vi.hoisted(() => ({ guard: { requireAuth: vi.fn() }, apply: { applyInvoice: vi.fn() } }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/invoices/apply", () => apply);
import { POST } from "../[id]/apply/route";

const call = () => POST(new NextRequest("https://t.local/x", { method: "POST" }), { params: Promise.resolve({ id: "inv1" }) });
beforeEach(() => { vi.clearAllMocks(); guard.requireAuth.mockResolvedValue({ userId: "u1", role: "admin", restaurantId: "r1" }); });

describe("POST /api/invoices/[id]/apply", () => {
  it("applies for the caller's restaurant", async () => {
    apply.applyInvoice.mockResolvedValue({ status: "applied", updated: 2, drafts: 1, connected: 0, ignored: 1, skipped: [] });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2, drafts: 1, connected: 0, ignored: 1, skipped: [] });
    expect(apply.applyInvoice).toHaveBeenCalledWith({ invoiceId: "inv1", restaurantId: "r1", userId: "u1" });
    expect(guard.requireAuth).toHaveBeenCalledWith(expect.anything(), "manage_products");
  });

  it("a repeated apply is a quiet success", async () => {
    apply.applyInvoice.mockResolvedValue({ status: "already_applied" });
    expect(await (await call()).json()).toEqual({ alreadyApplied: true });
  });

  it.each([
    [{ status: "error", code: "invoice_not_found" }, 404],
    [{ status: "error", code: "invoice_not_in_review" }, 409],
    [{ status: "error", code: "lines_undecided", positions: [3] }, 409],
  ])("maps %j to %i", async (result, status) => {
    apply.applyInvoice.mockResolvedValue(result);
    const res = await call();
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ code: result.code });
  });
});
