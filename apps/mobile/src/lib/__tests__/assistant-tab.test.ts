import { describe, expect, it } from "vitest";
import { canShowAssistantTab } from "../assistant-tab";

describe("assistant tab visibility", () => {
  it("hides chat from a viewer with a restaurant", () => {
    expect(canShowAssistantTab({ role: "viewer", restaurantId: "r1" })).toBe(false);
  });

  it("keeps preview chat for a viewer without a restaurant", () => {
    expect(canShowAssistantTab({ role: "viewer", restaurantId: null })).toBe(true);
  });

  it("shows chat for a sous-chef with a restaurant", () => {
    expect(canShowAssistantTab({ role: "sous_chef", restaurantId: "r1" })).toBe(true);
  });
});
