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
});
