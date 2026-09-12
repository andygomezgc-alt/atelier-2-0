import { expect, it } from "vitest";
import { MenuServiceChargesSchema, PatchMenuItemRequestSchema, ActivateMenuStyleSchema } from "./api-contract";
const charge = { id: "cover", name: "Coperto", price: 400, perPerson: true };
it("accepts menu charges in cents, including a complimentary charge", () => {
  expect(MenuServiceChargesSchema.parse([charge, { ...charge, id: "free", price: 0 }])).toHaveLength(2);
});
it("rejects blank names, fractional cents, negative amounts, duplicate IDs and too many charges", () => {
  for (const rows of [[{ ...charge, name: " " }], [{ ...charge, price: 1.5 }], [{ ...charge, price: -1 }], [charge, charge], Array.from({ length: 21 }, (_, i) => ({ ...charge, id: String(i) }))]) {
    expect(MenuServiceChargesSchema.safeParse(rows).success).toBe(false);
  }
});
it("accepts kg or portion but never arbitrary price units", () => {
  expect(PatchMenuItemRequestSchema.parse({ priceUnit: "kg" }).priceUnit).toBe("kg");
  expect(PatchMenuItemRequestSchema.safeParse({ priceUnit: "g" }).success).toBe(false);
});
it("requires the active version observed by the client to avoid overwriting a newer choice", () => {
  expect(ActivateMenuStyleSchema.safeParse({}).success).toBe(false);
  expect(ActivateMenuStyleSchema.safeParse({ expectedActiveVersionId: null }).success).toBe(true);
});
