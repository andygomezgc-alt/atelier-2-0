// Actual Inicio screen; only native and network boundaries are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type EffectCallback } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Idea } from "@/src/api/ideas";

const h = vi.hoisted(() => ({
  role: "viewer", listIdeas: vi.fn(), patchIdea: vi.fn(), push: vi.fn(), refresh: vi.fn(),
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
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock("@/src/hooks/useRefresh", () => ({ useRefresh: () => ({ refreshing: false, onRefresh: vi.fn() }) }));
vi.mock("@/src/hooks/useOfflineQueue", () => ({
  saveIdea: vi.fn(), flushQueue: async () => [], useOfflineQueueSize: () => ({ size: 0, refresh: h.refresh }),
}));
vi.mock("@/src/api/ideas", () => ({ listIdeas: h.listIdeas, patchIdea: h.patchIdea, deleteIdea: vi.fn() }));
vi.mock("@/src/components/LazyRestaurantHost", () => ({ ensureRestaurant: vi.fn() }));
vi.mock("@/src/components/Toast", () => ({ showToast: vi.fn() }));
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
const visibleText = () => screen.root.findAllByType("Text" as never)
  .flatMap((node) => node.children.filter((child): child is string => typeof child === "string"))
  .join(" ");
const idea: Idea = { id: "idea-1", text: "Roasted aubergine", status: "open", createdAt: "2026-10-06T10:00:00Z", authorName: "Chef", conversationsCount: 0 };
async function render() {
  await act(async () => { screen = create(createElement(InicioScreen)); });
  expect(h.listIdeas).toHaveBeenCalledOnce();
  expect(screen.root.findByProps({ children: idea.text })).toBeDefined();
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
  h.listIdeas.mockResolvedValue([idea]);
  h.patchIdea.mockResolvedValue({ id: idea.id, text: idea.text, status: "in_chat" });
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

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
