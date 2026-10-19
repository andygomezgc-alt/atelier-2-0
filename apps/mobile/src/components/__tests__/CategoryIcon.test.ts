import { describe, expect, it, vi } from "vitest";

vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("react-native", () => ({ Platform: { select: (items: Record<string, unknown>) => items.default } }));

import { CategoryIcon } from "../CategoryIcon";
import { categoryColors } from "@/src/theme";

describe("CategoryIcon", () => {
  it("takes each category's colour from the theme", () => {
    const categories = Object.keys(categoryColors) as (keyof typeof categoryColors)[];
    expect(categories).toHaveLength(11);
    for (const category of categories) {
      expect(CategoryIcon({ category }).props.color).toBe(categoryColors[category]);
    }
  });
});
