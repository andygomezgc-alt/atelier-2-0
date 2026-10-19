// Actual Inicio screen; only native and network boundaries are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type EffectCallback } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Idea } from "@/src/api/ideas";

type SpeechParams = { lang: string; onText: (text: string) => void; onError?: (code: string) => void };
const h = vi.hoisted(() => ({
  role: "viewer", listIdeas: vi.fn(), patchIdea: vi.fn(), push: vi.fn(), refresh: vi.fn(),
  saveIdea: vi.fn(), showToast: vi.fn(), tapLight: vi.fn(), focus: vi.fn(),
  lang: "es", speechAvailable: true, listening: false, start: vi.fn(), stop: vi.fn(),
  speech: null as SpeechParams | null,
  t: (key: string) => key,
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Modal: "Modal", Pressable: "Pressable",
  RefreshControl: "RefreshControl", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("expo-router", async () => {
  const { useEffect } = await vi.importActual<typeof import("react")>("react");
  return { useRouter: () => ({ push: h.push }), useFocusEffect: (callback: EffectCallback) => useEffect(callback, [callback]) };
});
vi.mock("@/src/hooks/useAuth", () => ({
  getCurrentIdentity: () => ({ userId: "chef-1", restaurantId: "restaurant-1" }),
  useAuth: () => ({ state: { status: "signed-in", user: { name: "Chef", role: h.role, restaurantId: "restaurant-1" } } }),
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: h.t, lang: h.lang }) }));
vi.mock("@/src/hooks/useRefresh", () => ({ useRefresh: () => ({ refreshing: false, onRefresh: vi.fn() }) }));
vi.mock("@/src/hooks/useOfflineQueue", () => ({
  saveIdea: h.saveIdea, flushQueue: async () => [], useOfflineQueueSize: () => ({ size: 0, refresh: h.refresh }),
}));
vi.mock("@/src/hooks/useSpeechInput", () => ({
  get speechAvailable() { return h.speechAvailable; },
  useSpeechInput: (params: SpeechParams) => {
    h.speech = params;
    return { listening: h.listening, start: h.start, stop: h.stop };
  },
}));
vi.mock("@/src/lib/haptics", () => ({ tapLight: h.tapLight, selection: vi.fn() }));
vi.mock("@/src/api/ideas", () => ({ listIdeas: h.listIdeas, patchIdea: h.patchIdea, deleteIdea: vi.fn() }));
vi.mock("@/src/components/LazyRestaurantHost", () => ({ ensureRestaurant: vi.fn() }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.showToast }));
vi.mock("@/src/components/Screen", () => ({ Screen: "Screen" }));
vi.mock("@/src/components/Eyebrow", () => ({ Eyebrow: "Eyebrow" }));
vi.mock("@/src/components/Empty", () => ({ Empty: "Empty" }));
vi.mock("@/src/components/SkeletonList", () => ({ SkeletonList: "SkeletonList" }));
vi.mock("@/src/components/NetworkError", () => ({ NetworkError: "NetworkError" }));
vi.mock("@/src/components/ConfirmSheet", () => ({ ConfirmSheet: "ConfirmSheet" }));
vi.mock("@/src/components/SectionExplainer", () => ({ SectionExplainer: "SectionExplainer" }));
vi.mock("@/src/lib/keyboard", () => ({ useKeyboardHeight: () => 0 }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "error" }));

import InicioScreen from "../../app/(tabs)/inicio";
let screen: ReactTestRenderer;
const visibleText = () => screen.root.findAllByType("Text" as never)
  .flatMap((node) => node.children.filter((child): child is string => typeof child === "string"))
  .join(" ");
const idea: Idea = { id: "idea-1", text: "Roasted aubergine", status: "open", createdAt: "2026-10-06T10:00:00Z", authorName: "Chef", conversationsCount: 0 };
async function mount() {
  await act(async () => {
    screen = create(createElement(InicioScreen), {
      createNodeMock: (element) => (element.type === "TextInput" ? { focus: h.focus } : null),
    });
  });
}
async function render() {
  await mount();
  expect(h.listIdeas).toHaveBeenCalledOnce();
  expect(screen.root.findByProps({ children: idea.text })).toBeDefined();
}
// The idea box input comes before the edit modal's input.
const ideaInput = () => screen.root.findAllByType("TextInput" as never)[0];
const saveButton = () => screen.root.findAllByProps({ children: "btn_save" })[0].parent!;
const micButtons = () => screen.root.findAllByProps({ accessibilityLabel: "chat_mic_label" });
async function type(value: string) {
  await act(async () => { ideaInput().props.onChangeText(value); });
}
async function pressIdea() {
  const body = screen.root.findByProps({ children: idea.text }).parent!;
  await act(async () => {
    if (!body.props.disabled) await body.props.onPress?.();
  });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.role = "viewer";
  h.lang = "es";
  h.speechAvailable = true;
  h.listening = false;
  h.speech = null;
  h.listIdeas.mockResolvedValue([idea]);
  h.patchIdea.mockResolvedValue({ id: idea.id, text: idea.text, status: "in_chat" });
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("idea card author", () => {
  it("does not render the author's name on the card", async () => {
    h.role = "sous_chef";
    h.listIdeas.mockResolvedValue([{ ...idea, authorName: "Marta Ruiz" }]);
    await render();
    expect(visibleText()).not.toContain("Marta Ruiz");
    expect(visibleText()).toContain("inicio_idea_action");
  });
});

describe("idea card status label", () => {
  it("labels an idea already in a chat and still opens it in the assistant", async () => {
    h.role = "sous_chef";
    h.listIdeas.mockResolvedValue([{ ...idea, status: "in_chat" }]);
    await render();
    expect(visibleText()).toContain("inicio_idea_in_chat");
    expect(visibleText()).not.toContain("inicio_idea_action");
    await pressIdea();
    expect(h.push).toHaveBeenCalledWith({ pathname: "/(tabs)/asistente", params: { ideaId: idea.id, ideaText: idea.text } });
  });

  it("takes the arrow from the translation, not from a literal in the screen", async () => {
    h.role = "sous_chef";
    await render();
    // The action is shown (as its translation key here), and no arrow is added around it.
    expect(visibleText()).toContain("inicio_idea_action");
    expect(visibleText()).not.toContain("→");
  });
});

describe("idea card chat permission", () => {
  it("does not show the assistant action to a restaurant viewer", async () => {
    await render();
    expect(visibleText()).not.toContain("inicio_idea_action");
  });

  it("does not patch or navigate to chat when a restaurant viewer presses an idea", async () => {
    await render();
    await pressIdea();
    expect(h.patchIdea).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });

  it("lets a sous-chef open the idea in the assistant with its context", async () => {
    h.role = "sous_chef";
    await render();
    expect(visibleText()).toContain("inicio_idea_action");
    await pressIdea();
    expect(h.patchIdea).toHaveBeenCalledWith(idea.id, { status: "in_chat" });
    expect(h.push).toHaveBeenCalledWith({ pathname: "/(tabs)/asistente", params: { ideaId: idea.id, ideaText: idea.text } });
  });
});

describe("idea dictation", () => {
  it("hides the microphone when on-device dictation is not available", async () => {
    h.speechAvailable = false;
    await render();
    expect(micButtons()).toHaveLength(0);
  });

  it("dictates in the app language after what is already typed, with a light tap", async () => {
    h.lang = "it";
    await render();
    expect(h.speech?.lang).toBe("it-IT");
    await type("Pichón");
    await act(async () => { micButtons()[0].props.onPress(); });
    expect(h.tapLight).toHaveBeenCalledOnce();
    expect(h.start).toHaveBeenCalledWith("Pichón");
    await act(async () => { h.speech!.onText("Pichón con espuma"); });
    expect(ideaInput().props.value).toBe("Pichón con espuma");
  });

  it("stops from the same button and does not save while listening", async () => {
    h.listening = true;
    await render();
    await type("Pichón");
    expect(saveButton().props.disabled).toBe(true);
    await act(async () => { screen.root.findByProps({ accessibilityLabel: "chat_mic_stop" }).props.onPress(); });
    expect(h.stop).toHaveBeenCalledOnce();
    expect(h.start).not.toHaveBeenCalled();
  });

  it("explains a missing permission or an unavailable recogniser", async () => {
    await render();
    await act(async () => { h.speech!.onError?.("permission"); });
    expect(h.showToast).toHaveBeenLastCalledWith("error_mic_permission", "error");
    await act(async () => { h.speech!.onError?.("unavailable"); });
    expect(h.showToast).toHaveBeenLastCalledWith("error_mic_unavailable", "error");
  });
});

describe("saving an idea", () => {
  it("gives a light tap once the idea is saved", async () => {
    h.saveIdea.mockResolvedValue({ status: "saved", idea: { ...idea, id: "idea-2", text: "Pichón" } });
    await render();
    await type("Pichón");
    await act(async () => { await saveButton().props.onPress(); });
    expect(h.saveIdea).toHaveBeenCalledWith("Pichón");
    expect(h.tapLight).toHaveBeenCalledOnce();
  });

  it("also taps when the idea is kept for later without a connection", async () => {
    h.saveIdea.mockResolvedValue({ status: "queued" });
    await render();
    await type("Pichón");
    await act(async () => { await saveButton().props.onPress(); });
    expect(h.showToast).toHaveBeenCalledWith("toast_idea_saved_offline");
    expect(h.tapLight).toHaveBeenCalledOnce();
  });

  it("does not tap when saving fails", async () => {
    h.saveIdea.mockRejectedValue(new Error("boom"));
    await render();
    await type("Pichón");
    await act(async () => { await saveButton().props.onPress(); });
    expect(h.showToast).toHaveBeenCalledWith("error");
    expect(h.tapLight).not.toHaveBeenCalled();
  });
});

describe("ideas list loading and empty states", () => {
  it("shows ghost cards instead of a spinner while the ideas load", async () => {
    h.listIdeas.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(screen.root.findAllByType("SkeletonList" as never)).toHaveLength(1);
    expect(screen.root.findAllByType("ActivityIndicator" as never)).toHaveLength(0);
  });

  it("offers to write the first idea from an empty notebook", async () => {
    h.listIdeas.mockResolvedValue([]);
    await mount();
    expect(screen.root.findAllByType("SkeletonList" as never)).toHaveLength(0);
    const empty = screen.root.findByType("Empty" as never);
    expect(empty.props.actionLabel).toBe("empty_inicio_action");
    await act(async () => { empty.props.onAction(); });
    expect(h.focus).toHaveBeenCalledOnce();
  });
});
