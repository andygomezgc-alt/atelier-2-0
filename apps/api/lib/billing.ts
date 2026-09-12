import Stripe from "stripe";
import { prisma, type Prisma } from "@atelier/db";

export class BillingError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^sk_(test|live)_/.test(key) || /placeholder|xxx/.test(key)) {
    throw new BillingError("billing_not_configured", 503);
  }
  return new Stripe(key, { timeout: 8000, maxNetworkRetries: 0 });
}

export function billingConfig() {
  if (process.env.BILLING_CHECKOUT_ENABLED !== "1") throw new BillingError("billing_disabled", 503);
  const priceId = process.env.STRIPE_PRICE_PRO;
  const rawUrl = process.env.BILLING_SITE_URL;
  if (!priceId || !rawUrl) throw new BillingError("billing_not_configured", 503);
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new BillingError("billing_not_configured", 503); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new BillingError("billing_not_configured", 503);
  }
  return { priceId, siteUrl: url.origin };
}

export function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

// Tanto checkout como webhook serializan los cambios de facturación del mismo
// restaurante. No modifica esquema ni bloquea a otros restaurantes.
export async function lockRestaurant(tx: Prisma.TransactionClient, restaurantId: string) {
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${restaurantId} FOR UPDATE`;
}

export function isProPrice(price: Stripe.Price) {
  return price.id === process.env.STRIPE_PRICE_PRO && price.currency === "eur" &&
    price.unit_amount === 4900 && price.type === "recurring" && price.billing_scheme === "per_unit" &&
    price.recurring?.interval === "month" && price.recurring.interval_count === 1 &&
    price.recurring.usage_type === "licensed" && price.tax_behavior === "exclusive";
}

export function isFounderCoupon(coupon: Stripe.Coupon, productId: string | null) {
  return coupon.valid && coupon.percent_off === 50 && coupon.amount_off === null &&
    coupon.duration === "repeating" && coupon.duration_in_months === 3 &&
    (!coupon.applies_to || !!productId && coupon.applies_to.products.includes(productId));
}

export function subscriptionPlan(sub: Stripe.Subscription): "founder" | "pro" {
  const couponId = process.env.STRIPE_COUPON_FOUNDER;
  const now = Date.now() / 1000;
  return couponId && sub.discounts.some(d => typeof d !== "string" &&
    idOf(d.source.coupon) === couponId && d.start <= now && d.end !== null && d.end > now)
    ? "founder" : "pro";
}

export function subscriptionData(sub: Stripe.Subscription, graceUntil: Date | null) {
  const base = { plan: subscriptionPlan(sub), trialEndsAt: null, graceUntil: null };
  switch (sub.status) {
    case "active": return { ...base, planStatus: "active" as const };
    case "trialing": return { ...base, planStatus: "trial" as const, trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null };
    case "past_due": return { ...base, planStatus: "past_due" as const, graceUntil: graceUntil ?? new Date(Date.now() + 7 * 86400000) };
    // Una suscripción incompleta o pausada no concede acceso de pago.
    default: return { ...base, planStatus: "canceled" as const };
  }
}

export function isManagedSubscription(sub: Stripe.Subscription, restaurantId: string, customerId: string) {
  const item = sub.items.data[0];
  return sub.metadata.billing_version === "1" && sub.metadata.restaurant_id === restaurantId &&
    idOf(sub.customer) === customerId && sub.items.data.length === 1 && !!item &&
    item.quantity === 1 && isProPrice(item.price);
}

export async function createCheckout(restaurantId: string) {
  const config = billingConfig();
  const stripe = stripeClient();
  const price = await stripe.prices.retrieve(config.priceId);
  if (!price.active || !isProPrice(price)) throw new BillingError("billing_price_invalid", 503);

  return prisma.$transaction(async tx => {
    await lockRestaurant(tx, restaurantId);
    const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new BillingError("restaurant_not_found", 404);
    let customerId = restaurant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { metadata: { restaurant_id: restaurantId, billing_version: "1" } },
        { idempotencyKey: `atelier-customer-${restaurantId}` },
      );
      customerId = customer.id;
      await tx.restaurant.update({ where: { id: restaurantId }, data: { stripeCustomerId: customerId } });
    } else {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted || customer.metadata.restaurant_id !== restaurantId) throw new BillingError("billing_customer_mismatch");
    }

    const history = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (history.has_more || history.data.some(s => !["canceled", "incomplete_expired"].includes(s.status))) {
      throw new BillingError("subscription_exists");
    }
    // La elegibilidad se decide en el servidor, nunca por parámetros del cliente.
    // Un restaurante que ya tuvo suscripción no reinicia los tres meses.
    const eligible = (process.env.BILLING_FOUNDER_RESTAURANT_IDS ?? "").split(",").map(v => v.trim()).includes(restaurantId) && history.data.length === 0;
    const couponId = eligible ? process.env.STRIPE_COUPON_FOUNDER : undefined;
    if (eligible) {
      if (!couponId) throw new BillingError("billing_coupon_missing", 503);
      const coupon = await stripe.coupons.retrieve(couponId);
      if (!isFounderCoupon(coupon, idOf(price.product))) throw new BillingError("billing_coupon_invalid", 503);
    }
    const metadata = { restaurant_id: restaurantId, billing_version: "1", offer: eligible ? "founder_3_months" : "pro", price_id: price.id, founder_coupon_id: couponId ?? "" };
    const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
    if (open.has_more) throw new BillingError("checkout_review_required");
    const existing = open.data.find(s => s.mode === "subscription");
    if (existing) {
      if (existing.metadata?.restaurant_id !== restaurantId || existing.metadata?.offer !== metadata.offer ||
          existing.metadata?.billing_version !== "1" || existing.metadata.price_id !== price.id ||
          existing.metadata.founder_coupon_id !== metadata.founder_coupon_id || !existing.url) throw new BillingError("checkout_review_required");
      return { url: existing.url };
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", customer: customerId, client_reference_id: restaurantId,
      line_items: [{ price: price.id, quantity: 1 }],
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      metadata, subscription_data: { metadata },
      automatic_tax: { enabled: true }, tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      billing_address_collection: "required", locale: "auto",
      success_url: `${config.siteUrl}/gracias?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.siteUrl}/pro`,
    }, { idempotencyKey: `atelier-checkout-${customerId}-${price.id}-${couponId ?? "pro"}-${Math.floor(Date.now() / 1800000)}` });
    if (!session.url) throw new BillingError("checkout_unavailable", 503);
    return { url: session.url };
  }, { timeout: 60000 });
}

export async function createCustomerPortal(restaurantId: string) {
  const config = billingConfig();
  const stripe = stripeClient();
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant?.stripeCustomerId) throw new BillingError("billing_customer_missing", 404);
  const customer = await stripe.customers.retrieve(restaurant.stripeCustomerId);
  if (customer.deleted || customer.metadata.restaurant_id !== restaurantId) throw new BillingError("billing_customer_mismatch");
  const portalConfig = process.env.STRIPE_PORTAL_CONFIGURATION;
  if (!portalConfig) throw new BillingError("billing_portal_not_configured", 503);
  const configuration = await stripe.billingPortal.configurations.retrieve(portalConfig);
  if (!configuration.active || !configuration.features.subscription_cancel.enabled ||
      configuration.features.subscription_cancel.mode !== "at_period_end" || configuration.features.subscription_update.enabled) {
    throw new BillingError("billing_portal_configuration_invalid", 503);
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.id, configuration: portalConfig, return_url: `${config.siteUrl}/pro`,
  });
  return { url: portal.url };
}

export type CheckoutStatus = "active" | "pending" | "expired" | "inactive" | "unavailable";

// El session_id es una referencia opaca. La página solo muestra estado genérico,
// nunca datos personales, facturas ni enlaces del portal de cliente.
export async function checkoutStatus(sessionId: string | undefined): Promise<CheckoutStatus> {
  if (!sessionId || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId) || sessionId.length > 255) return "unavailable";
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.mode !== "subscription" || session.metadata?.billing_version !== "1") return "unavailable";
  if (session.status === "expired") return "expired";
  if (session.status !== "complete" || session.payment_status !== "paid") return "pending";
  const restaurantId = session.metadata.restaurant_id;
  const customerId = idOf(session.customer);
  const subscriptionId = idOf(session.subscription);
  if (!restaurantId || session.client_reference_id !== restaurantId || !customerId || !subscriptionId) return "unavailable";
  const [restaurant, sub] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId } }),
    stripe.subscriptions.retrieve(subscriptionId, { expand: ["discounts"] }),
  ]);
  if (!restaurant || restaurant.stripeCustomerId !== customerId || !isManagedSubscription(sub, restaurantId, customerId)) return "unavailable";
  if (sub.status !== "active") return "inactive";
  return restaurant.stripeSubscriptionId === subscriptionId && restaurant.planStatus === "active" &&
    ["pro", "founder"].includes(restaurant.plan) ? "active" : "pending";
}
