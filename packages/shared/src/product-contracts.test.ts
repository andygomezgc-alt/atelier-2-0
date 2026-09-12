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
