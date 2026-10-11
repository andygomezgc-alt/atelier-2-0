import { describe, expect, it } from "vitest";
import { createRestaurantBody } from "../restaurant-create";

describe("create restaurant body", () => {
  it("trims the name, identity line and city", () => {
    expect(createRestaurantBody({ name: "  Kokoo ", identityLine: " Sea cooking ", city: " Ancona " })).toStrictEqual({
      name: "Kokoo",
      identityLine: "Sea cooking",
      city: "Ancona",
    });
  });

  it("omits blank optional fields", () => {
    expect(createRestaurantBody({ name: "Kokoo", identityLine: "   ", city: "" })).toStrictEqual({ name: "Kokoo" });
  });

  it("omits optional fields that were never filled", () => {
    expect(createRestaurantBody({ name: "Kokoo" })).toStrictEqual({ name: "Kokoo" });
  });
});
