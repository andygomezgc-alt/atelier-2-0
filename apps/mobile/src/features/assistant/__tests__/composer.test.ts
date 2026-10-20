// The assistant composer while dictating. It locks its input: the next speech result replaces
// the text from where dictation started, so anything typed meanwhile would be lost. It also shows
// that dictation is on: the microphone pulses and the input says so.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

vi.mock("react-native", () => ({
  Pressable: "Pressable", TextInput: "TextInput", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("@/src/theme", () => ({
  colors: new Proxy({}, { get: () => "#000000" }),
  fonts: new Proxy({}, { get: () => "Test" }),
  fontSizes: new Proxy({}, { get: () => 12 }),
  radii: new Proxy({}, { get: () => 8 }),
  spacing: new Proxy({}, { get: () => 8 }),
}));
vi.mock("@/src/components/SendButton", () => ({ SendButton: "SendButton" }));
vi.mock("@/src/components/ListeningPulse", () => ({ ListeningPulse: "ListeningPulse" }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/src/hooks/useSpeechInput", () => ({ speechAvailable: true }));

import { Composer } from "../components/Composer";

let screen: ReactTestRenderer;
const noop = () => {};
async function render(state: { listening: boolean; composerBusy: boolean }) {
  await act(async () => {
    screen = create(createElement(Composer, {
      input: "Pichón", onChangeText: noop, busy: false, stopping: false, onMic: noop, onSend: noop, onStop: noop, ...state,
    }));
  });
}
const input = () => screen.root.findByType("TextInput" as never);
const pulse = () => screen.root.findByType("ListeningPulse" as never);

beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("assistant composer while dictating", () => {
  it("lets the chef type when idle", async () => {
    await render({ listening: false, composerBusy: false });
    expect(input().props.editable).toBe(true);
  });

  it("locks the input while listening", async () => {
    await render({ listening: true, composerBusy: false });
    expect(input().props.editable).toBe(false);
  });

  it("still locks the input while a turn runs", async () => {
    await render({ listening: false, composerBusy: true });
    expect(input().props.editable).toBe(false);
  });

  it("pulses the microphone and says it is listening", async () => {
    await render({ listening: true, composerBusy: false });
    expect(pulse().props.active).toBe(true);
    expect(input().props.placeholder).toBe("mic_listening");
  });

  it("keeps the voice placeholder and a still microphone otherwise", async () => {
    await render({ listening: false, composerBusy: false });
    expect(pulse().props.active).toBe(false);
    expect(input().props.placeholder).toBe("chat_placeholder_voice");
  });
});
