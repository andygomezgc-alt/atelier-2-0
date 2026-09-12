// Actual Inicio screen, with storage/network behavior covered by the queue tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  saveIdea: vi.fn(), ensureRestaurant: vi.fn(), toast: vi.fn(), refresh: vi.fn(),
  identity: { userId: "chef-a", restaurantId: "restaurant-a" },
  t: (key: string) => key,
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Modal: "Modal", Pressable: "Pressable",
  RefreshControl: "RefreshControl", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }), useFocusEffect: vi.fn() }));
vi.mock("@/src/hooks/useAuth", () => ({ getCurrentIdentity: () => h.identity, useAuth: () => ({ state: { status: "signed-in", user: { name: "Chef" } } }) }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock("@/src/hooks/useRefresh", () => ({ useRefresh: () => ({ refreshing: false, onRefresh: vi.fn() }) }));
vi.mock("@/src/hooks/useOfflineQueue", () => ({ saveIdea: h.saveIdea, flushQueue: vi.fn(), useOfflineQueueSize: () => ({ size: 0, refresh: h.refresh }) }));
vi.mock("@/src/api/ideas", () => ({ listIdeas: vi.fn(), patchIdea: vi.fn(), deleteIdea: vi.fn() }));
vi.mock("@/src/components/LazyRestaurantHost", () => ({ ensureRestaurant: h.ensureRestaurant }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));
vi.mock("@/src/components/Screen", () => ({ Screen: "Screen" }));
vi.mock("@/src/components/Eyebrow", () => ({ Eyebrow: "Eyebrow" }));
vi.mock("@/src/components/Empty", () => ({ Empty: "Empty" }));
vi.mock("@/src/components/NetworkError", () => ({ NetworkError: "NetworkError" }));
vi.mock("@/src/components/ConfirmSheet", () => ({ ConfirmSheet: "ConfirmSheet" }));
vi.mock("@/src/components/SectionExplainer", () => ({ SectionExplainer: "SectionExplainer" }));
vi.mock("@/src/lib/keyboard", () => ({ useKeyboardHeight: () => 0 }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "error" }));

import InicioScreen from "../../app/(tabs)/inicio";
let screen: ReactTestRenderer;
const input = () => screen.root.findAllByType("TextInput" as never)[0]!;
const button = () => screen.root.findAllByType("Pressable" as never)[0]!;
async function renderDraft() {
  await act(async () => { screen = create(createElement(InicioScreen)); });
  await act(async () => { input().props.onChangeText("  Idea del chef  "); });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  h.identity = { userId: "chef-a", restaurantId: "restaurant-a" };
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("saving an idea from Inicio", () => {
  it("ignores rapid double taps and clears the form once a durable submission is queued", async () => {
    let finish!: (value: unknown) => void;
    h.saveIdea.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await renderDraft();
    await act(async () => { void button().props.onPress(); void button().props.onPress(); });
    expect(h.ensureRestaurant).toHaveBeenCalledOnce();
    expect(h.saveIdea).toHaveBeenCalledOnce();
    expect(h.saveIdea).toHaveBeenCalledWith("Idea del chef");
    expect(input().props.editable).toBe(false);
    expect(button().props.disabled).toBe(true);
    await act(async () => { finish({ status: "queued" }); });
    expect(input().props.value).toBe("");
    expect(input().props.editable).toBe(true);
    expect(h.toast).toHaveBeenCalledWith("toast_idea_saved_offline");
  });
  it("keeps the draft and unlocks saving if persistence or validation fails", async () => {
    h.saveIdea.mockRejectedValue(new Error("disk full"));
    await renderDraft();
    await act(async () => { await button().props.onPress(); });
    expect(input().props.value).toBe("  Idea del chef  ");
    expect(button().props.disabled).toBe(false);
    expect(h.toast).toHaveBeenCalledWith("error");
  });
  it("keeps the draft when restaurant creation is cancelled", async () => {
    h.ensureRestaurant.mockRejectedValue(new Error("cancelled"));
    await renderDraft();
    await act(async () => { await button().props.onPress(); });
    expect(h.saveIdea).not.toHaveBeenCalled();
    expect(input().props.value).toBe("  Idea del chef  ");
    expect(h.toast).not.toHaveBeenCalled();
  });
  it("does not announce a save in another team if the identity changes before completion", async () => {
    h.saveIdea.mockImplementation(async () => {
      h.identity = { userId: "chef-b", restaurantId: "restaurant-b" };
      return { status: "saved", idea: { id: "idea-a", text: "Idea del chef" } };
    });
    await renderDraft();
    await act(async () => { await button().props.onPress(); });
    expect(h.toast).not.toHaveBeenCalled();
  });
});
