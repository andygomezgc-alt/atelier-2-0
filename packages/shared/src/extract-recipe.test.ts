import { describe, it, expect } from "vitest";
import { ExtractRecipeRequestSchema } from "./api-contract";

describe("ExtractRecipeRequestSchema (A-01)", () => {
  it("acepta texto válido", () => {
    expect(
      ExtractRecipeRequestSchema.safeParse({ text: "Arroz meloso…" }).success,
    ).toBe(true);
  });

  it("rechaza faltante, vacío o demasiado largo", () => {
    expect(ExtractRecipeRequestSchema.safeParse({}).success).toBe(false);
    expect(ExtractRecipeRequestSchema.safeParse({ text: "" }).success).toBe(
      false,
    );
    expect(
      ExtractRecipeRequestSchema.safeParse({ text: "x".repeat(30001) }).success,
    ).toBe(false);
  });
});
