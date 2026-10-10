// apps/mobile/src/components/__tests__/MarkdownText.test.ts
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  View: "View",
}));

import { MarkdownText } from "@/src/components/MarkdownText";

type RenderedJson = ReturnType<ReactTestRenderer["toJSON"]>;

function collectTexts(node: RenderedJson): string[] {
  if (node === null) return [];
  if (Array.isArray(node)) return node.flatMap(collectTexts);
  return (node.children ?? []).flatMap((child) => (typeof child === "string" ? [child] : collectTexts(child)));
}

// Numbers drawn by the ordered-list bullets (e.g. "4."), in rendering order.
function renderedNumbers(text: string): string[] {
  let screen!: ReactTestRenderer;
  act(() => {
    screen = create(createElement(MarkdownText, { text }));
  });
  const numbers = collectTexts(screen.toJSON()).filter((t) => /^\d+\.$/.test(t));
  act(() => screen.unmount());
  return numbers;
}

describe("MarkdownText list numbering", () => {
  it("shows 1, 2, 3 for items split by blank lines and a nested bullet", () => {
    expect(
      renderedNumbers("1. Prepara la masa.\n\n2. Hornea 20 minutos.\n   - Gira la bandeja a mitad.\n3. Deja enfriar."),
    ).toEqual(["1.", "2.", "3."]);
  });

  it("shows the written start number of a list that begins at 4", () => {
    expect(renderedNumbers("Antes de empezar revisa el horno.\n4. Bate los huevos.\n5. Monta la nata.")).toEqual([
      "4.",
      "5.",
    ]);
  });

  it("shows lazy 1. 1. 1. items as 1, 2, 3", () => {
    expect(renderedNumbers("1. Prepara la masa.\n1. Hornea 20 minutos.\n1. Deja enfriar.")).toEqual(["1.", "2.", "3."]);
  });

  it("shows lazy 1. 1. 1. items separated by blank lines as 1, 2, 3", () => {
    expect(renderedNumbers("1. Prepara la masa.\n\n1. Hornea 20 minutos.\n\n1. Deja enfriar.")).toEqual(["1.", "2.", "3."]);
  });

  it("numbers an open list with a gap as start + index", () => {
    expect(renderedNumbers("1. Prepara la masa.\n3. Hornea 20 minutos.")).toEqual(["1.", "2."]);
  });
});
