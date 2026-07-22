import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// constructEvent controlado + prisma.restaurant mockeado. No tocamos DB ni la
// API de Stripe: solo verificamos la lógica del handler.
// FakePrismaKnownRequestError vive DENTRO de vi.hoisted a propósito: vi.mock
// se hoistea al tope del archivo, así que solo puede referenciar bindings
// creados también vía vi.hoisted (si no, TDZ al evaluar la factory).
const { constructEvent, db, log, FakePrismaKnownRequestError } = vi.hoisted(() => {
  class FakePrismaKnownRequestError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    constructEvent: vi.fn(),
    db: {
      restaurant: {
        updateMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      processedStripeEvent: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    FakePrismaKnownRequestError,
  };
});

// `new Stripe()` devuelve el objeto con nuestro constructEvent (un constructor
// que retorna un objeto hace que `new` devuelva ese objeto).
vi.mock("stripe", () => ({
  default: vi.fn(() => ({ webhooks: { constructEvent } })),
}));
vi.mock("@atelier/db", () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError: FakePrismaKnownRequestError },
}));
vi.mock("@/lib/logger", () => ({ logger: log }));

import * as route from "../route";

function post(body = "raw-body") {
  return route.POST(
    new NextRequest("https://t.local/api/stripe/webhook", {
      method: "POST",
      body,
      headers: { "stripe-signature": "sig-header" },
    }),
  );
}

beforeEach(() => {
  constructEvent.mockReset();
  db.restaurant.updateMany.mockReset();
  db.restaurant.findFirst.mockReset();
  db.restaurant.update.mockReset();
  // Por defecto el evento nunca se vio: findUnique() no lo encuentra y create()
  // pega, así el handler sigue al switch. Los tests de idempotencia lo pisan.
  db.processedStripeEvent.create.mockReset().mockResolvedValue({ id: "evt_x" });
  db.processedStripeEvent.findUnique.mockReset().mockResolvedValue(null);
  // $transaction interactivo: ejecuta el callback con `db` como cliente tx (en
  // el mock tx === db, así tx.restaurant.* son los mismos spies). Si el callback
  // tira, re-lanza — como Prisma al revertir la transacción.
  db.$transaction
    .mockReset()
    .mockImplementation(async (cb: (tx: typeof db) => unknown) => cb(db));
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/stripe/webhook", () => {
  it("sin STRIPE_WEBHOOK_SECRET → 503 (no configurado)", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const res = await post();
    expect(res.status).toBe(503);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("firma inválida (constructEvent tira) → 400", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await post();
    expect(res.status).toBe(400);
    expect(db.restaurant.updateMany).not.toHaveBeenCalled();
  });

  it("checkout.session.completed → update con active + customerId", async () => {
    constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "rest-1",
          customer: "cus_123",
          subscription: "sub_123",
          metadata: { plan: "founder" },
        },
      },
    });
    db.restaurant.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await post();
    expect(res.status).toBe(200);

    const arg = db.restaurant.updateMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: "rest-1" });
    expect(arg.data.planStatus).toBe("active");
    expect(arg.data.stripeCustomerId).toBe("cus_123");
    expect(arg.data.stripeSubscriptionId).toBe("sub_123");
    expect(arg.data.plan).toBe("founder");
    expect(arg.data.graceUntil).toBeNull();
  });

  it("checkout.session.completed con plan desconocido → cae a 'pro'", async () => {
    constructEvent.mockReturnValue({
      id: "evt_1b",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "rest-1",
          customer: "cus_123",
          subscription: "sub_123",
          metadata: { plan: "nope" },
        },
      },
    });
    db.restaurant.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await post();
    expect(res.status).toBe(200);
    expect(db.restaurant.updateMany.mock.calls[0]![0].data.plan).toBe("pro");
  });

  it("customer.subscription.deleted → canceled", async () => {
    constructEvent.mockReturnValue({
      id: "evt_2",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_123", customer: "cus_123", status: "canceled" } },
    });
    db.restaurant.findFirst.mockResolvedValueOnce({ id: "rest-1", graceUntil: null });
    db.restaurant.update.mockResolvedValueOnce({});

    const res = await post();
    expect(res.status).toBe(200);

    const arg = db.restaurant.update.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: "rest-1" });
    expect(arg.data.planStatus).toBe("canceled");
  });

  it("restaurante desconocido → 200 sin update", async () => {
    constructEvent.mockReturnValue({
      id: "evt_3",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_x", customer: "cus_x", status: "active" } },
    });
    db.restaurant.findFirst.mockResolvedValue(null);

    const res = await post();
    expect(res.status).toBe(200);
    expect(db.restaurant.update).not.toHaveBeenCalled();
  });

  // P2-6 (auditoría jul 2026) + estabilización — idempotencia ATÓMICA por event.id.
  it("evento ya procesado (findUnique lo encuentra) → 200 already processed, sin create ni switch", async () => {
    constructEvent.mockReturnValue({
      id: "evt_seen",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "rest-1", customer: "cus_123", subscription: "sub_123" } },
    });
    db.processedStripeEvent.findUnique.mockResolvedValueOnce({ id: "evt_seen" });

    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyProcessed).toBe(true);
    expect(db.processedStripeEvent.create).not.toHaveBeenCalled();
    expect(db.restaurant.updateMany).not.toHaveBeenCalled();
  });

  it("carrera concurrente: create tira P2002 dentro de la tx → 200 already processed, sin tocar el switch", async () => {
    constructEvent.mockReturnValue({
      id: "evt_race",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "rest-1",
          customer: "cus_123",
          subscription: "sub_123",
          metadata: { plan: "founder" },
        },
      },
    });
    // findUnique no lo ve (otra entrega aún no commiteó) pero el create choca.
    db.processedStripeEvent.create.mockRejectedValueOnce(
      new FakePrismaKnownRequestError("Unique constraint failed", "P2002"),
    );

    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyProcessed).toBe(true);
    expect(db.restaurant.updateMany).not.toHaveBeenCalled();
  });

  it("negocio falla dentro de la tx → 500 y el evento NO queda consumido; el retry SÍ aplica", async () => {
    constructEvent.mockReturnValue({
      id: "evt_retry",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "rest-1",
          customer: "cus_123",
          subscription: "sub_123",
          metadata: { plan: "pro" },
        },
      },
    });

    // 1er intento: el update de negocio tira → la tx revierte también el
    // processedStripeEvent. En el mock eso se refleja en que findUnique sigue
    // devolviendo null en el retry (nada quedó consumido).
    db.restaurant.updateMany.mockRejectedValueOnce(new Error("db down"));
    const first = await post();
    expect(first.status).toBe(500);

    // 2º intento (retry de Stripe): ahora el update resuelve → el cambio se
    // aplica (antes del fix, el evento quedaba consumido y esto no ocurría).
    db.restaurant.updateMany.mockResolvedValueOnce({ count: 1 });
    const second = await post();
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.received).toBe(true);
    expect(body.alreadyProcessed).toBeUndefined();
    expect(db.restaurant.updateMany).toHaveBeenCalledTimes(2);
  });

  it("error real (no P2002) dentro de la tx → 500, sin dejar el evento consumido", async () => {
    constructEvent.mockReturnValue({
      id: "evt_err",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "rest-1", customer: "cus_123", subscription: "sub_123" } },
    });
    db.processedStripeEvent.create.mockRejectedValueOnce(new Error("connection lost"));

    const res = await post();
    expect(res.status).toBe(500);
    expect(db.restaurant.updateMany).not.toHaveBeenCalled();
  });
});
