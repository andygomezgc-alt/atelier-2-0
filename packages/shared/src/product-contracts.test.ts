import { describe, expect, it } from "vitest";
import { CreateProductRequestSchema, PatchProductRequestSchema } from "./api-contract";

describe("product editing contracts", () => {
  it("accepts several declared allergens and removes duplicates", () => {
    expect(PatchProductRequestSchema.parse({ allergens: ["milk", "eggs", "milk"] }).allergens).toEqual(["milk", "eggs"]);
    expect(CreateProductRequestSchema.parse({ name: "Salsa", category: "otro", unidadCompra: "kg", precioCompra: 500, allergens: ["milk", "eggs"] }).allergens).toEqual(["milk", "eggs"]);
  });
  it("keeps an explicit empty declaration distinct from no review", () => {
    expect(PatchProductRequestSchema.parse({ allergens: [] }).allergens).toEqual([]);
    expect(PatchProductRequestSchema.parse({ precioCompra: 500 }).allergens).toBeUndefined();
  });
  it("rejects unknown allergens and zero usable yield", () => {
    expect(PatchProductRequestSchema.safeParse({ allergens: ["unknown"] }).success).toBe(false);
    expect(PatchProductRequestSchema.safeParse({ mermaPct: 100 }).success).toBe(false);
    expect(PatchProductRequestSchema.safeParse({ mermaPct: 99.99 }).success).toBe(true);
  });
});

describe("gramosPorLitro (weight of one litre) contract", () => {
  const base = { name: "Aceite de oliva", category: "vinagre_aceite", unidadCompra: "l", precioCompra: 500 } as const;

  it("accepts a positive weight with up to two decimals on create and patch", () => {
    expect(CreateProductRequestSchema.parse({ ...base, gramosPorLitro: 920 }).gramosPorLitro).toBe(920);
    expect(PatchProductRequestSchema.parse({ gramosPorLitro: 1030.25 }).gramosPorLitro).toBe(1030.25);
    expect(PatchProductRequestSchema.parse({ gramosPorLitro: 0.01 }).gramosPorLitro).toBe(0.01);
    expect(PatchProductRequestSchema.parse({ gramosPorLitro: 99999.99 }).gramosPorLitro).toBe(99999.99);
  });

  it("null clears it on patch; leaving it out does not touch it", () => {
    expect(PatchProductRequestSchema.parse({ gramosPorLitro: null }).gramosPorLitro).toBeNull();
    expect(PatchProductRequestSchema.parse({ precioCompra: 500 })).not.toHaveProperty("gramosPorLitro");
    expect(CreateProductRequestSchema.parse(base)).not.toHaveProperty("gramosPorLitro");
  });

  it.each([0, -1, 920.123, 100000, "920"])("rejects %s", (gramosPorLitro) => {
    expect(CreateProductRequestSchema.safeParse({ ...base, gramosPorLitro }).success).toBe(false);
    expect(PatchProductRequestSchema.safeParse({ gramosPorLitro }).success).toBe(false);
  });
});
