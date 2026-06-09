import { describe, it, expect } from "vitest";
import {
  CreateRestaurantResponseSchema,
  JoinRestaurantResponseSchema,
} from "./api-contract";

describe("CreateRestaurantResponseSchema (A-10)", () => {
  it("acepta una respuesta canónica del POST /api/restaurant", () => {
    const ok = {
      id: "rest_abc123",
      name: "Ristorante Marche",
      inviteCode: "MARCHE-123",
      role: "admin",
    };
    expect(CreateRestaurantResponseSchema.safeParse(ok).success).toBe(true);
  });

  it("rechaza role inválido", () => {
    expect(
      CreateRestaurantResponseSchema.safeParse({
        id: "x",
        name: "n",
        inviteCode: "c",
        role: "owner",
      }).success,
    ).toBe(false);
  });

  it("rechaza campos faltantes", () => {
    expect(
      CreateRestaurantResponseSchema.safeParse({ id: "x", name: "n" }).success,
    ).toBe(false);
  });
});

describe("JoinRestaurantResponseSchema (A-10)", () => {
  it("acepta una respuesta canónica del POST /api/restaurant/join", () => {
    const ok = {
      restaurantId: "rest_abc123",
      restaurantName: "Ristorante Marche",
      role: "viewer",
    };
    expect(JoinRestaurantResponseSchema.safeParse(ok).success).toBe(true);
  });

  it("rechaza role inválido", () => {
    expect(
      JoinRestaurantResponseSchema.safeParse({
        restaurantId: "x",
        restaurantName: "n",
        role: "guest",
      }).success,
    ).toBe(false);
  });

  it("rechaza campos faltantes (sin role)", () => {
    expect(
      JoinRestaurantResponseSchema.safeParse({
        restaurantId: "x",
        restaurantName: "n",
      }).success,
    ).toBe(false);
  });
});
