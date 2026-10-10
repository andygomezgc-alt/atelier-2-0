import { describe, expect, it } from "vitest";
import { RoleSchema } from "./api-contract";
import { importedRecipeState } from "./recipe-import";
import * as shared from "./index";

describe("importedRecipeState", () => {
  for (const role of RoleSchema.options) {
    const state = role === "admin" ? "approved" : "in_test";
    it(`returns ${state} for ${role}`, () => {
      expect(typeof importedRecipeState).toBe("function");
      if (typeof importedRecipeState !== "function") throw new Error("importedRecipeState is not exported");
      expect(importedRecipeState(role)).toBe(state);
    });
  }

  it("is exported from the shared index", () => {
    expect(typeof shared.importedRecipeState).toBe("function");
  });
});
