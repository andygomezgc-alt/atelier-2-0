// Proposal 4: a product's row shows how much its last price moved, up in the danger colour, down in green.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
}));
vi.mock("@/src/theme", () => ({
  colors: new Proxy({}, { get: (_target, key) => `color:${String(key)}` }),
  fonts: new Proxy({}, { get: () => "font" }),
  fontSizes: new Proxy({}, { get: () => 12 }),
  spacing: new Proxy({}, { get: () => 4 }),
}));
vi.mock("@/src/hooks/useI18n", () => ({
  useI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
}));

import { PriceChangeBadge } from "../PriceChangeBadge";

function render(pct: number | null | undefined): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(createElement(PriceChangeBadge, { pct })); });
  return renderer;
}

const colorOf = (style: unknown) => Object.assign({}, ...[style].flat(Infinity)).color;

describe("PriceChangeBadge", () => {
  it("a rise shows the up arrow text and its spoken label in the danger colour", () => {
    const text = render(12).root.findByType("Text" as never);
    expect(text.children.join("")).toBe('product_price_up:{"n":12}');
    expect(text.props.accessibilityLabel).toBe('product_price_up_a11y:{"n":12}');
    expect(colorOf(text.props.style)).toBe("color:danger");
  });

  it("a drop shows the down arrow text with the size of the drop in green", () => {
    const text = render(-5).root.findByType("Text" as never);
    expect(text.children.join("")).toBe('product_price_down:{"n":5}');
    expect(text.props.accessibilityLabel).toBe('product_price_down_a11y:{"n":5}');
    expect(colorOf(text.props.style)).toBe("color:green");
  });

  it("renders nothing without a change", () => {
    expect(render(null).toJSON()).toBeNull();
    expect(render(undefined).toJSON()).toBeNull();
    expect(render(0).toJSON()).toBeNull();
  });
});
