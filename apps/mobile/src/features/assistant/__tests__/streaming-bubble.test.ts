// A13c: the streaming bubble's recovering status (interrupted or resuming) is visible text, with no writing dots,
// and it never shows a partial answer while recovering.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { StreamText } from "../stream-text-store";
import { styles } from "../chat-styles";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  View: "View",
}));
vi.mock("@/src/theme", () => ({
  colors: new Proxy({}, { get: () => "#000000" }),
  fonts: new Proxy({}, { get: () => "Test" }),
  fontSizes: new Proxy({}, { get: () => 12 }),
  radii: new Proxy({}, { get: () => 8 }),
  spacing: new Proxy({}, { get: () => 8 }),
}));
vi.mock("@/src/components/MarkdownText", () => ({ MarkdownText: "MarkdownText" }));
vi.mock("@/src/components/TypingDots", () => ({ TypingDots: "TypingDots" }));
vi.mock("@/src/lib/recipe-payload", () => ({ stripRecipePayload: (text: string) => text }));

import { StreamingBubble } from "../components/StreamingBubble";

function fakeStream(text: string): StreamText {
  return {
    subscribe: () => () => {},
    getSnapshot: () => text,
    push: () => false,
    finish: async (full: string) => full,
    reveal: (full: string) => full,
    reset: () => {},
    dispose: () => {},
  } as unknown as StreamText;
}

function renderBubble(text: string, recovering: boolean, statusLabel: string): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(StreamingBubble, { stream: fakeStream(text), eyebrowLabel: "eyebrow", statusLabel, recovering }));
  });
  return renderer;
}

// The one screen-reader live region of the bubble.
const liveRegion = (renderer: ReactTestRenderer) => renderer.root.findAll((node) => node.props.accessibilityLiveRegion === "polite");

// Visible status: the status text sits in a view that is not the screen-reader-only one, and carries typography.
const visibleStatusText = (renderer: ReactTestRenderer) =>
  renderer.root.findAll((node) => (node.type as unknown) === "Text" && node.props.children === "chat_answer_recovering" &&
    node.props.style !== undefined && node.parent?.props.style !== styles.srOnly);

describe("streaming bubble: recovering status (A13c)", () => {
  it("while recovering, a partial answer is not shown: no answer body, and the status is visible", () => {
    const renderer = renderBubble("Berenjena", true, "chat_answer_recovering");
    expect(renderer.root.findAllByType("MarkdownText" as never)).toHaveLength(0);
    expect(visibleStatusText(renderer)).toHaveLength(1);
  });

  it("while recovering with no text, the status is visible text (not the screen-reader-only view) and no writing dots show", () => {
    const renderer = renderBubble("", true, "chat_answer_recovering");
    expect(liveRegion(renderer)).toHaveLength(1);
    expect(liveRegion(renderer)[0]!.props.style).not.toBe(styles.srOnly);
    expect(visibleStatusText(renderer)).toHaveLength(1);
    expect(renderer.root.findAllByType("TypingDots" as never)).toHaveLength(0);
  });

  it("while writing with no text, the status is screen-reader only and the writing dots show (guard)", () => {
    const renderer = renderBubble("", false, "chat_answer_writing");
    expect(liveRegion(renderer)[0]!.props.style).toBe(styles.srOnly);
    expect(renderer.root.findAllByType("TypingDots" as never)).toHaveLength(1);
  });

  it("while writing with text, the answer body is shown (guard)", () => {
    const renderer = renderBubble("Berenjena", false, "chat_answer_writing");
    expect(renderer.root.findAllByType("MarkdownText" as never).map((node) => node.props.text)).toEqual(["Berenjena"]);
  });
});
