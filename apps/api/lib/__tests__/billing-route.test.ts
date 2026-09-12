import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { requireAuth, rateLimit } = vi.hoisted(() => ({ requireAuth: vi.fn(), rateLimit: vi.fn() }));
vi.mock("../permissions-guard", () => ({ requireAuth, isNextResponse: (v: unknown) => v instanceof NextResponse }));
vi.mock("../rate-limit", () => ({ rateLimit }));
vi.mock("../logger", () => ({ logger: { error: vi.fn() } }));
import { billingAction } from "../billing-route";
const action = vi.fn();
function request(headers: Record<string, string> = { authorization: "Bearer test" }) {
  return new NextRequest("https://atelier.test/api/stripe/checkout?restaurantId=other", { method: "POST", headers, body: JSON.stringify({ restaurantId: "other", price: 1, coupon: "forever", return_url: "https://evil.test" }) });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("BILLING_CHECKOUT_ENABLED", "1"); vi.stubEnv("STRIPE_PRICE_PRO", "price_pro"); vi.stubEnv("BILLING_SITE_URL", "https://atelier.test");
  requireAuth.mockResolvedValue({ userId: "admin-1", role: "admin", restaurantId: "own-rest" }); rateLimit.mockReturnValue({ ok: true }); action.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
});
afterEach(() => vi.unstubAllEnvs());
it("desactivado no ejecuta la acción", async () => {
  vi.stubEnv("BILLING_CHECKOUT_ENABLED", "0"); expect((await billingAction(request(), action)).status).toBe(503); expect(action).not.toHaveBeenCalled();
});
it("usa el restaurante autenticado e ignora parámetros manipulados", async () => {
  expect((await billingAction(request(), action)).status).toBe(200); expect(action).toHaveBeenCalledWith("own-rest");
});
it("rechaza usuario sin sesión", async () => {
  requireAuth.mockResolvedValue(NextResponse.json({}, { status: 401 })); expect((await billingAction(request(), action)).status).toBe(401); expect(action).not.toHaveBeenCalled();
});
it.each(["viewer", "sous_chef", "chef_executive"])("rechaza rol %s", async role => {
  requireAuth.mockResolvedValue({ userId: "u", restaurantId: "r", role }); expect((await billingAction(request(), action)).status).toBe(403); expect(action).not.toHaveBeenCalled();
});
it("rechaza origen ajeno incluso con Authorization", async () => {
  expect((await billingAction(request({ origin: "https://evil.test", authorization: "Bearer invalid" }), action)).status).toBe(403); expect(action).not.toHaveBeenCalled();
});
it("cookie sin Origin no permite acciones de pago", async () => {
  expect((await billingAction(request({}), action)).status).toBe(403); expect(action).not.toHaveBeenCalled();
});
it("admite la cookie con origen correcto", async () => {
  expect((await billingAction(request({ origin: "https://atelier.test" }), action)).status).toBe(200);
});
it("limita intentos repetidos", async () => {
  rateLimit.mockReturnValue({ ok: false, retryAfter: 30 }); expect((await billingAction(request(), action)).status).toBe(429); expect(action).not.toHaveBeenCalled();
});
