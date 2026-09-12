import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { sdk, db, FakePrismaError } = vi.hoisted(() => {
  class FakePrismaError extends Error { code = "P2002"; }
  return {
    FakePrismaError,
    sdk: { webhooks: { constructEvent: vi.fn() }, checkout: { sessions: { retrieve: vi.fn() } }, subscriptions: { retrieve: vi.fn() } },
    db: { restaurant: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() }, processedStripeEvent: { create: vi.fn(), findUnique: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn() },
  };
});
vi.mock("stripe", () => ({ default: function StripeMock() { return sdk; } }));
vi.mock("@atelier/db", () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: FakePrismaError } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { POST } from "../route";

const metadata = { restaurant_id: "rest-1", billing_version: "1" };
const price = { id: "price_pro", currency: "eur", unit_amount: 4900, type: "recurring", billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "exclusive" };
const subscription = () => ({ id: "sub_1", customer: "cus_1", status: "active", metadata, discounts: [], items: { data: [{ price, quantity: 1 }] } });
const session = () => ({ id: "cs_test_example", client_reference_id: "rest-1", customer: "cus_1", subscription: "sub_1", mode: "subscription", status: "complete", payment_status: "paid", metadata });
const restaurant = () => ({ id: "rest-1", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", graceUntil: null });
function event(type = "checkout.session.completed", object: unknown = session()) { sdk.webhooks.constructEvent.mockReturnValue({ id: "evt_1", type, data: { object } }); }
function post() { return POST(new NextRequest("https://atelier.test/api/stripe/webhook", { method: "POST", body: "raw", headers: { "stripe-signature": "sig" } })); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake"); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fake"); vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
  db.$transaction.mockImplementation(async cb => cb(db));
  db.restaurant.findUnique.mockResolvedValue(restaurant());
  db.restaurant.findFirst.mockResolvedValue({ id: "rest-1" });
  db.processedStripeEvent.findUnique.mockResolvedValue(null);
  sdk.checkout.sessions.retrieve.mockResolvedValue(session());
  sdk.subscriptions.retrieve.mockResolvedValue(subscription());
  event();
});
afterEach(() => vi.unstubAllEnvs());

describe("webhook seguro", () => {
  it("rechaza firma inválida sin tocar la base de datos", async () => {
    sdk.webhooks.constructEvent.mockImplementation(() => { throw Error("bad signature"); });
    expect((await post()).status).toBe(400); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("sin secreto devuelve 503", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", ""); expect((await post()).status).toBe(503);
  });
  it("no activa un checkout cuyo pago sigue pendiente", async () => {
    sdk.checkout.sessions.retrieve.mockResolvedValue({ ...session(), payment_status: "unpaid" });
    expect((await post()).status).toBe(200); expect(db.restaurant.update).not.toHaveBeenCalled();
  });
  it("activa el restaurante validado y bloquea antes de consultar Stripe", async () => {
    expect((await post()).status).toBe(200);
    expect(db.restaurant.update).toHaveBeenCalledWith({ where: { id: "rest-1" }, data: expect.objectContaining({ plan: "pro", planStatus: "active", stripeSubscriptionId: "sub_1", graceUntil: null }) });
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(sdk.subscriptions.retrieve.mock.invocationCallOrder[0]!);
  });
  it("procesa la confirmación de un pago asíncrono", async () => {
    event("checkout.session.async_payment_succeeded"); expect((await post()).status).toBe(200); expect(db.restaurant.update).toHaveBeenCalled();
  });
  it("un Payment Link antiguo no activa aunque contenga restaurantId", async () => {
    event("checkout.session.completed", { ...session(), metadata: { plan: "founder" } });
    await post(); expect(db.restaurant.update).not.toHaveBeenCalled(); expect(sdk.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });
  it("rechaza un customer perteneciente a otro restaurante", async () => {
    sdk.checkout.sessions.retrieve.mockResolvedValue({ ...session(), customer: "cus_other" });
    await post(); expect(db.restaurant.update).not.toHaveBeenCalled();
  });
  it("rechaza precio equivocado aunque el pago figure como completado", async () => {
    sdk.subscriptions.retrieve.mockResolvedValue({ ...subscription(), items: { data: [{ quantity: 1, price: { ...price, unit_amount: 1 } }] } });
    await post(); expect(db.restaurant.update).not.toHaveBeenCalled();
  });
  it("un evento viejo usa el estado actual de Stripe", async () => {
    event("customer.subscription.updated", { ...subscription(), status: "active" });
    sdk.subscriptions.retrieve.mockResolvedValue({ ...subscription(), status: "canceled" });
    await post(); expect(db.restaurant.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ planStatus: "canceled" }) }));
  });
  it("no busca por customer una suscripción vieja", async () => {
    event("customer.subscription.deleted", { ...subscription(), id: "sub_old" }); db.restaurant.findFirst.mockResolvedValue(null);
    await post(); expect(db.restaurant.findFirst).toHaveBeenCalledTimes(1); expect(db.restaurant.findFirst).toHaveBeenCalledWith({ where: { stripeSubscriptionId: "sub_old" }, select: { id: true } }); expect(db.restaurant.update).not.toHaveBeenCalled();
  });
  it("revalida el enlace después de obtener el bloqueo", async () => {
    event("customer.subscription.updated", subscription()); db.restaurant.findUnique.mockResolvedValue({ ...restaurant(), stripeSubscriptionId: "sub_new" });
    await post(); expect(db.restaurant.update).not.toHaveBeenCalled();
  });
  it("un checkout viejo no sustituye otra suscripción activa", async () => {
    db.restaurant.findUnique.mockResolvedValue({ ...restaurant(), stripeSubscriptionId: "sub_new" });
    sdk.subscriptions.retrieve.mockResolvedValue({ ...subscription(), id: "sub_new" });
    await post(); expect(db.restaurant.update).not.toHaveBeenCalled();
  });
  it("una nueva compra puede sustituir la suscripción cancelada", async () => {
    db.restaurant.findUnique.mockResolvedValue({ ...restaurant(), stripeSubscriptionId: "sub_old" });
    sdk.subscriptions.retrieve.mockResolvedValueOnce({ ...subscription(), id: "sub_old", status: "canceled" });
    await post(); expect(db.restaurant.update).toHaveBeenCalled();
  });
  it("no extiende repetidamente la gracia de un impago", async () => {
    const graceUntil = new Date("2026-09-01"); event("customer.subscription.updated", subscription());
    db.restaurant.findUnique.mockResolvedValue({ ...restaurant(), graceUntil }); sdk.subscriptions.retrieve.mockResolvedValue({ ...subscription(), status: "past_due" });
    await post(); expect(db.restaurant.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ graceUntil, planStatus: "past_due" }) }));
  });
  it("reentrega confirmada no vuelve a aplicar el cambio", async () => {
    db.processedStripeEvent.findUnique.mockResolvedValue({ id: "evt_1" }); const response = await post();
    expect(await response.json()).toEqual({ received: true, alreadyProcessed: true }); expect(db.restaurant.update).not.toHaveBeenCalled();
  });
  it("un error de Stripe devuelve 500 para permitir el reintento", async () => {
    sdk.subscriptions.retrieve.mockRejectedValueOnce(Error("Stripe down")); expect((await post()).status).toBe(500);
    expect((await post()).status).toBe(200); expect(db.restaurant.update).toHaveBeenCalledTimes(1);
  });
  it("un P2002 ajeno a event.id no se oculta como duplicado", async () => {
    db.restaurant.update.mockRejectedValue(new FakePrismaError()); expect((await post()).status).toBe(500);
  });
  it("un P2002 de entrega concurrente se comprueba fuera de la transacción", async () => {
    db.processedStripeEvent.create.mockRejectedValue(new FakePrismaError());
    db.processedStripeEvent.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "evt_1" });
    expect(await (await post()).json()).toEqual({ received: true, alreadyProcessed: true });
  });
});
