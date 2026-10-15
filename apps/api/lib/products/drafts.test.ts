// apps/api/lib/products/drafts.test.ts
import { describe, expect, it, vi } from "vitest";
import { createDraftProduct } from "./drafts";

const tx = () => ({ product: { create: vi.fn(async ({ data }) => ({ id: "new", name: data.name, aliases: [] })) } });

describe("createDraftProduct", () => {
  it("creates a draft with the kitchen defaults for its name", async () => {
    const t = tx();
    await createDraftProduct(t as never, { restaurantId: "r1", name: "Zucchine" });
    expect(t.product.create.mock.calls[0]![0].data).toMatchObject({
      restaurantId: "r1", name: "Zucchine", precioCompra: 0, estado: "borrador", mermaOrigen: "sugerida", criticalityManual: false,
    });
    expect(t.product.create.mock.calls[0]![0].data).not.toHaveProperty("taxRatePct");
  });

  it("takes the invoice's unit, price, tax and price date", async () => {
    const t = tx();
    const at = new Date("2026-10-10T12:00:00Z");
    await createDraftProduct(t as never, { restaurantId: "r1", name: "Zucchine", unidadCompra: "kg", precioCompra: 180, taxRatePct: 4, precioActualizadoAt: at });
    expect(t.product.create.mock.calls[0]![0].data).toMatchObject({ unidadCompra: "kg", precioCompra: 180, taxRatePct: 4, precioActualizadoAt: at });
  });
});
