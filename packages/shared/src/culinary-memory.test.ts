import { describe, expect, it } from "vitest";
import { PatchCulinaryMemorySchema } from "./culinary-memory";
describe("memory contract", () => {
  it("requiere versión y rechaza preferencias duplicadas o demasiado largas", () => {
    expect(PatchCulinaryMemorySchema.safeParse({ enabled: true }).success).toBe(false);
    expect(PatchCulinaryMemorySchema.safeParse({ expectedVersion: 0, corrections: [{ key: "cuisine", text: "a" }, { key: "cuisine", text: "b" }] }).success).toBe(false);
    expect(PatchCulinaryMemorySchema.safeParse({ expectedVersion: 0, identityLine: "x".repeat(1001) }).success).toBe(false);
  });
  it("no acepta restaurante del cliente ni categorías sensibles inferidas", () => {
    expect(PatchCulinaryMemorySchema.safeParse({ expectedVersion: 0, restaurantId: "foreign" }).success).toBe(false);
    expect(PatchCulinaryMemorySchema.safeParse({ expectedVersion: 0, corrections: [{ key: "allergies", text: "sin gluten" }] }).success).toBe(false);
  });
  it("conserva la ciudad opcional", () => {
    expect(PatchCulinaryMemorySchema.parse({ expectedVersion: 0, city: "Ancona" })).toEqual({ expectedVersion: 0, city: "Ancona" });
  });
  it("recorta la ciudad", () => {
    expect(PatchCulinaryMemorySchema.parse({ expectedVersion: 0, city: "  Ancona, Marche  " })).toEqual({ expectedVersion: 0, city: "Ancona, Marche" });
  });
  it("conserva una ciudad de exactamente 80 caracteres después del recorte", () => {
    const city = "a".repeat(80);
    expect(PatchCulinaryMemorySchema.parse({ expectedVersion: 0, city: `  ${city}  ` })).toEqual({ expectedVersion: 0, city });
  });
  it("rechaza una ciudad de 81 caracteres", () => {
    expect(PatchCulinaryMemorySchema.safeParse({ expectedVersion: 0, city: "a".repeat(81) }).success).toBe(false);
  });
  it("acepta null para borrar la ciudad", () => {
    expect(PatchCulinaryMemorySchema.parse({ expectedVersion: 0, city: null })).toEqual({ expectedVersion: 0, city: null });
  });
  it("acepta omitir la ciudad sin añadirla", () => {
    expect(PatchCulinaryMemorySchema.parse({ expectedVersion: 0 })).toEqual({ expectedVersion: 0 });
  });
});
