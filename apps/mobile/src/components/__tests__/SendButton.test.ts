// apps/mobile/src/components/__tests__/SendButton.test.ts
// A12 RED: the send button's accessibility label is a translated key (es, it, en), not a literal.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { es, t as translate, type TranslationKey } from "@atelier/i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("react-native-reanimated", () => ({
  default: { View: "AnimatedView" },
  Easing: { in: () => 0, out: () => 0, quad: 0 },
  cancelAnimation: vi.fn(),
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: unknown) => ({ value }),
  withRepeat: vi.fn(),
  withSequence: vi.fn(),
  withSpring: vi.fn(),
  withTiming: vi.fn(),
}));
vi.mock("@/src/theme", () => ({ colors: new Proxy({}, { get: () => "#000000" }) }));
// Same convention as the chat-navigation harness: t() returns its key, so labels are checked as keys.
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { SendButton } from "@/src/components/SendButton";

const LANGS = ["es", "it", "en"] as const;

describe("SendButton accessibility (A12)", () => {
  it("labels the send action with a translated key, not a literal string", () => {
    let screen!: ReturnType<typeof create>;
    act(() => {
      screen = create(createElement(SendButton, { disabled: false, streaming: false, onPress: vi.fn() }));
    });
    const label = screen.root.findByType("Pressable" as never).props.accessibilityLabel;
    expect(Object.keys(es)).toContain(label);
    for (const lang of LANGS) expect(translate(label as TranslationKey, lang)).not.toBe(label);
  });
});
