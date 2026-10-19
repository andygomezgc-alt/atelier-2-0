// Contrast guard for the accent tokens used on small text and buttons (WCAG AA: 4.5:1).
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { select: (o: { default: string }) => o.default } }));

import { colors } from "@/src/theme";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("accent token contrast", () => {
  it("paper label on the terracotaDeep button passes AA", () => {
    expect(contrast(colors.terracotaDeep, colors.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("terracotaDeep small text on a paperSoft card passes AA", () => {
    expect(contrast(colors.terracotaDeep, colors.paperSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it("teal small text on a paperSoft card passes AA", () => {
    expect(contrast(colors.teal, colors.paperSoft)).toBeGreaterThanOrEqual(4.5);
  });
});
