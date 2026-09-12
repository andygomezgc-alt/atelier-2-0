// Actual screen, native/transport boundaries replaced. No AI calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  params: {} as Record<string, string | undefined>,
  setParams: vi.fn(), listMessages: vi.fn(), getConversationByIdea: vi.fn(),
  createConversation: vi.fn(), streamMessage: vi.fn(), alert: vi.fn(), toast: vi.fn(),
  extract: vi.fn(), listening: false, restaurantId: "restaurant-1" as string | null,
  t: (key: string) => key,
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", FlatList: "FlatList", Image: "Image",
  Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View",
  Alert: { alert: h.alert }, Keyboard: { dismiss: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => h.params, useRouter: () => ({ setParams: h.setParams, push: vi.fn() }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView", useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock("react-native-reanimated", () => ({ default: { View: "AnimatedView" }, Easing: {}, withSpring: vi.fn(), withTiming: vi.fn() }));
vi.mock("@/src/hooks/useAuth", () => ({ useAuth: () => ({ state: { status: "signed-in", user: { name: "Chef", restaurantId: h.restaurantId, defaultModel: "creative", languagePref: "es" } } }) }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: h.t }), dateLocale: () => "es-ES" }));
vi.mock("@/src/hooks/useSpeechInput", () => ({ speechAvailable: true, useSpeechInput: () => ({ listening: h.listening, start: vi.fn(), stop: vi.fn() }) }));
vi.mock("@/src/api/conversations", () => ({ createConversation: h.createConversation, streamMessage: h.streamMessage, listMessages: h.listMessages, getConversationByIdea: h.getConversationByIdea, bulkAddMessages: vi.fn() }));
vi.mock("@/src/api/recipes", () => ({ extractRecipeFromAssistant: h.extract }));
vi.mock("@/src/components/LazyRestaurantHost", () => ({ ensureRestaurant: vi.fn() }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));
vi.mock("@/src/components/Empty", () => ({ Empty: "Empty" }));
vi.mock("@/src/components/NetworkError", () => ({ NetworkError: "NetworkError" }));
vi.mock("@/src/components/PreviousChatsSheet", () => ({ PreviousChatsSheet: "PreviousChatsSheet" }));
vi.mock("@/src/components/ProfileSheet", () => ({ ProfileSheet: "ProfileSheet" }));
vi.mock("@/src/components/MarkdownText", () => ({ MarkdownText: "MarkdownText" }));
vi.mock("@/src/components/TypingDots", () => ({ TypingDots: "TypingDots" }));
vi.mock("@/src/components/SendButton", () => ({ SendButton: "SendButton" }));
vi.mock("@/src/lib/keyboard", () => ({ useKeyboardHeight: () => 0 }));
vi.mock("@/src/lib/haptics", () => ({ selection: vi.fn(), tapLight: vi.fn() }));
vi.mock("@/src/lib/recipe-draft", () => ({ setRecipeDraft: vi.fn() }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "error" }));

import AsistenteScreen from "../../app/(tabs)/asistente";
let screen: ReactTestRenderer;
const saved = [
  { id: "m1", role: "user", content: "Un plato de berenjena", createdAt: "2026-09-09T10:00:00Z" },
  { id: "m2", role: "assistant", content: "Berenjena asada con yogur", createdAt: "2026-09-09T10:00:01Z" },
];
const button = (label: string) => screen.root.findByProps({ accessibilityLabel: label });
const input = () => screen.root.findByType("TextInput" as never);
const messages = () => screen.root.findAllByType("FlatList" as never)[0]?.props.data ?? [];
async function render() { await act(async () => { screen = create(createElement(AsistenteScreen)); }); }
async function update() { await act(async () => { screen.update(createElement(AsistenteScreen)); }); }
async function newChat() {
  await act(async () => { button("chat_new").props.onPress(); });
  await update();
}
async function send(text: string) {
  await act(async () => { input().props.onChangeText(text); });
  await act(async () => { void screen.root.findByType("SendButton" as never).props.onPress(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.params = {};
  h.restaurantId = "restaurant-1";
  h.listening = false;
  h.setParams.mockImplementation((params) => { h.params = { ...h.params, ...params }; });
  h.listMessages.mockResolvedValue(saved);
  h.getConversationByIdea.mockResolvedValue({ id: "saved-chat", messages: saved });
  h.createConversation.mockResolvedValue({ id: "new-chat" });
  h.streamMessage.mockResolvedValue("Respuesta nueva");
});
afterEach(async () => {
  if (screen) await act(async () => { screen.unmount(); });
  vi.useRealTimers();
});

describe("new conversation from the assistant screen", () => {
  it("clears saved chat and idea, keeps the model, opens no AI request until sending", async () => {
    h.params = { conversationId: "saved-chat", ideaId: "idea-1", ideaText: "Berenjena" };
    await render();
    expect(messages()).toHaveLength(2);
    await newChat();
    expect(messages()).toEqual([]);
    expect(h.params).toMatchObject({ conversationId: undefined, ideaId: undefined, ideaText: undefined });
    expect(h.alert).not.toHaveBeenCalled();
    expect(h.createConversation).not.toHaveBeenCalled();
    expect(h.streamMessage).not.toHaveBeenCalled();
    await send("Otro plato");
    expect(h.createConversation).toHaveBeenCalledWith({ ideaId: null, modelUsed: "creative" });
    expect(h.streamMessage).toHaveBeenCalledWith("new-chat", "Otro plato", "creative", expect.any(Function), expect.any(AbortSignal), undefined, expect.any(String));
  });
  it("resets a chat without a URL ID, then recovers the old chat through history", async () => {
    await render();
    await send("Una receta");
    expect(messages()).toHaveLength(2);
    await newChat();
    expect(messages()).toEqual([]);
    const session = h.params.chatSession;
    await newChat();
    expect(h.params.chatSession).not.toBe(session);
    await act(async () => { screen.root.findByType("PreviousChatsSheet" as never).props.onPick({ id: "saved-chat", ideaText: null }); });
    await update();
    expect(messages().map((m: { id: string }) => m.id)).toEqual(["m2", "m1"]);
    expect(h.params.conversationId).toBe("saved-chat");
  });
  it("asks before discarding an unsent draft; cancellation keeps it intact", async () => {
    await render();
    await act(async () => { input().props.onChangeText("Texto pendiente"); });
    await newChat();
    expect(h.setParams).not.toHaveBeenCalled();
    expect(input().props.value).toBe("Texto pendiente");
    expect(h.alert.mock.calls[0][1]).toBe("chat_leave_draft");
    await act(async () => { h.alert.mock.calls[0][2][1].onPress(); });
    await update();
    expect(input().props.value).toBe("");
  });
  it("warns before leaving a preview with no server history", async () => {
    h.restaurantId = null;
    await render();
    await send("Prueba sin restaurante");
    await newChat();
    expect(h.alert.mock.calls[0][1]).toBe("chat_leave_unsaved");
    expect(messages()).toHaveLength(2);
    expect(h.createConversation).not.toHaveBeenCalled();
  });
  it("ignores an old history load after opening a new chat", async () => {
    let finish!: (value: typeof saved) => void;
    h.listMessages.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    h.params = { conversationId: "slow-chat" };
    await render();
    expect(input().props.editable).toBe(false);
    await newChat();
    await act(async () => { finish(saved); });
    expect(messages()).toEqual([]);
    expect(input().props.editable).toBe(true);
  });
  it("blocks sending after history failed to load and offers a retry", async () => {
    h.listMessages.mockRejectedValueOnce(new Error("offline"));
    h.params = { conversationId: "saved-chat" };
    await render();
    expect(input().props.editable).toBe(false);
    await act(async () => { screen.root.findByType("NetworkError" as never).props.onRetry(); });
    expect(messages()).toHaveLength(2);
    expect(input().props.editable).toBe(true);
  });
  it("does not switch while a response is in progress", async () => {
    h.streamMessage.mockImplementationOnce(() => new Promise(() => {}));
    await render();
    await send("En curso");
    expect(button("chat_new").props.disabled).toBe(true);
    expect(button("chat_history").props.disabled).toBe(true);
    await newChat();
    expect(h.setParams).not.toHaveBeenCalled();
  });
  it("does not switch while dictating", async () => {
    h.listening = true;
    await render();
    expect(button("chat_new").props.disabled).toBe(true);
    await newChat();
    expect(h.setParams).not.toHaveBeenCalled();
  });
  it("warns before leaving a failed send that may not have reached server history", async () => {
    h.streamMessage.mockRejectedValueOnce(new Error("offline"));
    await render();
    await send("Mi mensaje pendiente");
    await newChat();
    expect(h.alert.mock.calls[0][1]).toBe("chat_leave_pending");
    expect(messages()).toHaveLength(1);
    expect(h.setParams).not.toHaveBeenCalled();
  });
});
