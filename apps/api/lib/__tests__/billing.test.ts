import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const { sdk, db } = vi.hoisted(() => ({
  sdk: {
    prices: { retrieve: vi.fn() }, coupons: { retrieve: vi.fn() },
    customers: { create: vi.fn(), retrieve: vi.fn() }, subscriptions: { list: vi.fn(), retrieve: vi.fn() },
    checkout: { sessions: { list: vi.fn(), create: vi.fn(), retrieve: vi.fn() } },
    billingPortal: { configurations: { retrieve: vi.fn() }, sessions: { create: vi.fn() } },
  },
  db: { restaurant: { findUnique: vi.fn(), update: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn() },
}));
vi.mock("stripe", () => ({ default: function StripeMock() { return sdk; } }));
vi.mock("@atelier/db", () => ({ prisma: db }));
import { billingConfig, checkoutStatus, createCheckout, createCustomerPortal, isFounderCoupon, subscriptionData } from "../billing";

const price = { id: "price_pro", active: true, product: "prod_pro", currency: "eur", unit_amount: 4900, type: "recurring", billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "exclusive" };
const metadata = { restaurant_id: "rest-1", billing_version: "1", offer: "pro", price_id: "price_pro", founder_coupon_id: "" };
const coupon = { id: "coupon_founder", valid: true, percent_off: 50, amount_off: null, duration: "repeating", duration_in_months: 3 };
const sub = () => ({ id: "sub_1", customer: "cus_1", status: "active", metadata, discounts: [], items: { data: [{ price, quantity: 1 }] } });
const restaurant = () => ({ id: "rest-1", stripeCustomerId: "cus_1", stripeSubscriptionId: null, planStatus: "active", plan: "pilot" });
const session = () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/test", status: "complete", payment_status: "paid", mode: "subscription", client_reference_id: "rest-1", metadata, customer: "cus_1", subscription: "sub_1" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BILLING_CHECKOUT_ENABLED", "1"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake"); vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
  vi.stubEnv("BILLING_SITE_URL", "https://atelier.test"); vi.stubEnv("STRIPE_COUPON_FOUNDER", "coupon_founder");
  vi.stubEnv("BILLING_FOUNDER_RESTAURANT_IDS", ""); vi.stubEnv("STRIPE_PORTAL_CONFIGURATION", "bpc_1");
  db.$transaction.mockImplementation(async cb => cb(db));
  db.restaurant.findUnique.mockResolvedValue(restaurant());
  sdk.prices.retrieve.mockResolvedValue(price); sdk.coupons.retrieve.mockResolvedValue(coupon);
  sdk.customers.retrieve.mockResolvedValue({ id: "cus_1", metadata }); sdk.customers.create.mockResolvedValue({ id: "cus_1" });
  sdk.subscriptions.list.mockResolvedValue({ data: [], has_more: false }); sdk.subscriptions.retrieve.mockResolvedValue(sub());
  sdk.checkout.sessions.list.mockResolvedValue({ data: [], has_more: false }); sdk.checkout.sessions.create.mockResolvedValue(session());
  sdk.checkout.sessions.retrieve.mockResolvedValue(session());
  sdk.billingPortal.configurations.retrieve.mockResolvedValue({ active: true, features: { subscription_cancel: { enabled: true, mode: "at_period_end" }, subscription_update: { enabled: false } } });
  sdk.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.com/test" });
});
afterEach(() => vi.unstubAllEnvs());

describe("preparación del checkout", () => {
  it("apagado no consulta Stripe ni crea clientes", async () => {
    vi.stubEnv("BILLING_CHECKOUT_ENABLED", "0"); await expect(createCheckout("rest-1")).rejects.toMatchObject({ code: "billing_disabled" });
    expect(sdk.prices.retrieve).not.toHaveBeenCalled(); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each(["https://atelier.test/evil", "https://user:password@atelier.test", "https://atelier.test?next=evil", "ftp://atelier.test"])("rechaza URL de retorno no válida: %s", url => {
    vi.stubEnv("BILLING_SITE_URL", url); expect(() => billingConfig()).toThrow("billing_not_configured");
  });
  it("crea solo la tarifa mensual autorizada, con origen fijo e impuestos", async () => {
    await createCheckout("rest-1");
    const args = sdk.checkout.sessions.create.mock.calls[0]![0];
    expect(args).toMatchObject({ mode: "subscription", customer: "cus_1", client_reference_id: "rest-1", line_items: [{ price: "price_pro", quantity: 1 }], success_url: "https://atelier.test/gracias?session_id={CHECKOUT_SESSION_ID}", automatic_tax: { enabled: true } });
    expect(args.discounts).toBeUndefined(); expect(args.allow_promotion_codes).toBeUndefined(); expect(args.subscription_data.trial_period_days).toBeUndefined();
  });
  it("cliente nuevo se enlaza al restaurante y usa idempotencia", async () => {
    db.restaurant.findUnique.mockResolvedValue({ ...restaurant(), stripeCustomerId: null });
    await createCheckout("rest-1");
    expect(sdk.customers.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ restaurant_id: "rest-1" }) }), { idempotencyKey: "atelier-customer-rest-1" });
    expect(db.restaurant.update).toHaveBeenCalledWith({ where: { id: "rest-1" }, data: { stripeCustomerId: "cus_1" } });
  });
  it.each([{ unit_amount: 2450 }, { currency: "usd" }, { tax_behavior: "inclusive" }, { recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } }])("rechaza precio que no coincide con la oferta: %j", async change => {
    sdk.prices.retrieve.mockResolvedValue({ ...price, ...change });
    await expect(createCheckout("rest-1")).rejects.toMatchObject({ code: "billing_price_invalid" }); expect(sdk.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("solo aplica fundador a restaurantes autorizados sin historial", async () => {
    vi.stubEnv("BILLING_FOUNDER_RESTAURANT_IDS", "rest-1, rest-2"); await createCheckout("rest-1");
    expect(sdk.checkout.sessions.create.mock.calls[0]![0]).toMatchObject({ discounts: [{ coupon: "coupon_founder" }], metadata: { offer: "founder_3_months" } });
  });
  it.each([{ duration: "forever" }, { duration_in_months: 4 }, { percent_off: 100 }, { applies_to: { products: ["prod_other"] } }])("rechaza cupón incorrecto: %j", async change => {
    vi.stubEnv("BILLING_FOUNDER_RESTAURANT_IDS", "rest-1"); sdk.coupons.retrieve.mockResolvedValue({ ...coupon, ...change });
    await expect(createCheckout("rest-1")).rejects.toMatchObject({ code: "billing_coupon_invalid" }); expect(sdk.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("recontratar no reinicia el descuento de fundador", async () => {
    vi.stubEnv("BILLING_FOUNDER_RESTAURANT_IDS", "rest-1"); sdk.subscriptions.list.mockResolvedValue({ data: [{ status: "canceled" }], has_more: false });
    await createCheckout("rest-1"); expect(sdk.checkout.sessions.create.mock.calls[0]![0].discounts).toBeUndefined();
  });
  it.each(["active", "past_due", "trialing", "unpaid", "incomplete", "paused"])("bloquea otra compra si ya existe suscripción %s", async status => {
    sdk.subscriptions.list.mockResolvedValue({ data: [{ status }], has_more: false });
    await expect(createCheckout("rest-1")).rejects.toMatchObject({ code: "subscription_exists" }); expect(sdk.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("reutiliza un checkout abierto para evitar dobles intentos", async () => {
    sdk.checkout.sessions.list.mockResolvedValue({ data: [{ ...session(), status: "open" }], has_more: false });
    expect(await createCheckout("rest-1")).toEqual({ url: "https://checkout.stripe.com/test" }); expect(sdk.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("no reutiliza una sesión con otra oferta o precio", async () => {
    sdk.checkout.sessions.list.mockResolvedValue({ data: [{ ...session(), metadata: { ...metadata, price_id: "price_old" } }], has_more: false });
    await expect(createCheckout("rest-1")).rejects.toMatchObject({ code: "checkout_review_required" });
  });
  it("rechaza customer que pertenece a otro restaurante", async () => {
    sdk.customers.retrieve.mockResolvedValue({ id: "cus_1", metadata: { restaurant_id: "other" } });
    await expect(createCheckout("rest-1")).rejects.toMatchObject({ code: "billing_customer_mismatch" });
  });
});

describe("estado visible y cancelación", () => {
  it("sin sesión válida no afirma pago ni llama a Stripe", async () => {
    expect(await checkoutStatus(undefined)).toBe("unavailable"); expect(await checkoutStatus("inventada")).toBe("unavailable");
    expect(sdk.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });
  it("pago confirmado con webhook pendiente no afirma plan activo", async () => {
    expect(await checkoutStatus("cs_test_123")).toBe("pending");
  });
  it("solo confirma activo si coinciden pago, suscripción y restaurante", async () => {
    db.restaurant.findUnique.mockResolvedValue({ ...restaurant(), stripeSubscriptionId: "sub_1", plan: "pro" });
    expect(await checkoutStatus("cs_test_123")).toBe("active");
  });
  it("no confirma pago de otro customer", async () => {
    db.restaurant.findUnique.mockResolvedValue({ ...restaurant(), stripeCustomerId: "cus_other" });
    expect(await checkoutStatus("cs_test_123")).toBe("unavailable");
  });
  it("distingue enlace caducado", async () => {
    sdk.checkout.sessions.retrieve.mockResolvedValue({ ...session(), status: "expired" }); expect(await checkoutStatus("cs_test_123")).toBe("expired");
  });
  it("no mantiene la etiqueta fundador después del descuento", () => {
    const expired = { ...sub(), discounts: [{ source: { coupon: "coupon_founder" }, start: 1, end: 2 }] } as unknown as Stripe.Subscription;
    expect(subscriptionData(expired, null).plan).toBe("pro");
    const current = { ...expired, discounts: [{ source: { coupon: "coupon_founder" }, start: 1, end: Date.now() / 1000 + 1000 }] } as unknown as Stripe.Subscription;
    expect(subscriptionData(current, null).plan).toBe("founder");
    expect(isFounderCoupon(coupon as Stripe.Coupon, "prod_pro")).toBe(true);
  });
  it("portal usa exclusivamente el customer del restaurante", async () => {
    await createCustomerPortal("rest-1"); expect(sdk.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: "cus_1", configuration: "bpc_1", return_url: "https://atelier.test/pro" });
  });
  it("rechaza portal con cancelación inmediata o cambios de plan", async () => {
    sdk.billingPortal.configurations.retrieve.mockResolvedValue({ active: true, features: { subscription_cancel: { enabled: true, mode: "immediately" }, subscription_update: { enabled: true } } });
    await expect(createCustomerPortal("rest-1")).rejects.toMatchObject({ code: "billing_portal_configuration_invalid" });
  });
});
