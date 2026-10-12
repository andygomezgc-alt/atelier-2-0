import { describe, expect, it } from "vitest";
import { projectProductDetail, projectProductListItem } from "./projections";

type DetailSource = Parameters<typeof projectProductDetail>[0];

// Prisma.Decimal stand-in: the projection converts it with Number().
const dec = (v: number) => ({ toString: () => String(v), valueOf: () => v });

function productRow(gramosPorLitro: unknown): DetailSource {
  return {
    id: "p-oil",
    restaurantId: "r1",
    name: "Aceite de oliva",
    category: "vinagre_aceite",
    pezzatura: null,
    pezzaturaMode: null,
    pezzaturaMin: null,
    pezzaturaMax: null,
    unidadCompra: "l",
    precioCompra: 500,
    mermaPct: dec(0),
    mermaOrigen: "sugerida",
    proveedor: null,
    precioActualizadoAt: new Date("2026-10-12T10:00:00Z"),
    notas: null,
    estado: "activo",
    aliases: [],
    criticality: "baja",
    criticalityManual: false,
    allergen: null,
    allergens: [],
    allergensReviewed: true,
    gramosPorLitro,
    deletedAt: null,
    createdAt: new Date("2026-10-12T10:00:00Z"),
    updatedAt: new Date("2026-10-12T10:00:00Z"),
  } as unknown as DetailSource;
}

describe("product projection — gramosPorLitro", () => {
  it("exposes the declared weight of one litre as a number", () => {
    expect(projectProductListItem(productRow(dec(920))).gramosPorLitro).toBe(920);
    expect(projectProductDetail(productRow(dec(1030.25))).gramosPorLitro).toBe(1030.25);
  });

  it("exposes null when it is unknown (also when a stale client engine omits the column)", () => {
    expect(projectProductListItem(productRow(null))).toHaveProperty("gramosPorLitro", null);
    expect(projectProductListItem(productRow(undefined))).toHaveProperty("gramosPorLitro", null);
  });
});
