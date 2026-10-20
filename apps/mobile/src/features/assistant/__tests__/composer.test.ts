// The assistant composer shows that dictation is on: the microphone pulses and the input says so.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({ Pressable: "Pressable", TextInput: "TextInput", View: "View" }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("@/src/components/SendButton", () => ({ SendButton: "SendButton" }));
vi.mock("@/src/components/ListeningPulse", () => ({ ListeningPulse: "ListeningPulse" }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/src/hooks/useSpeechInput", () => ({ speechAvailable: true }));
vi.mock("@/src/theme", () => ({ colors: new Proxy({}, { get: () => "#000000" }) }));
vi.mock("../chat-styles", () => ({ styles: new Proxy({}, { get: () => ({}) }) }));

import { Composer } from "../components/Composer";

function render(listening: boolean): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(Composer, {
      input: "",
      onChangeText: vi.fn(),
      composerBusy: false,
      listening,
      busy: false,
      stopping: false,
      onMic: vi.fn(),
      onSend: vi.fn(),
      onStop: vi.fn(),
    }));
  });
  return tree;
}

describe("assistant composer while dictating", () => {
  it("pulses the microphone and says it is listening", () => {
    const tree = render(true);
    expect(tree.root.findByType("ListeningPulse" as never).props.active).toBe(true);
    expect(tree.root.findByType("TextInput" as never).props.placeholder).toBe("mic_listening");
  });

  it("keeps the voice placeholder and a still microphone otherwise", () => {
    const tree = render(false);
    expect(tree.root.findByType("ListeningPulse" as never).props.active).toBe(false);
    expect(tree.root.findByType("TextInput" as never).props.placeholder).toBe("chat_placeholder_voice");
  });
});
