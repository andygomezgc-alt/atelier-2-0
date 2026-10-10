// Actual screen, native/transport boundaries replaced. No AI calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  params: {} as Record<string, string | undefined>,
  setParams: vi.fn(), listMessages: vi.fn(), getConversationByIdea: vi.fn(),
  createConversation: vi.fn(), streamMessage: vi.fn(), alert: vi.fn(), toast: vi.fn(),
  extract: vi.fn(), notifyUnauthorized: vi.fn(), listening: false, restaurantId: "restaurant-1" as string | null, role: "chef_executive",
  t: (key: string) => key,
  getToken: vi.fn(),
  streamHeaders: {} as Record<string, string>,
  emitStreamError: null as null | (() => void),
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
vi.mock("@/src/hooks/useAuth", () => ({ useAuth: () => ({ state: { status: "signed-in", user: { name: "Chef", restaurantId: h.restaurantId, role: h.role, defaultModel: "creative", languagePref: "es" } } }) }));
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
vi.mock("@/src/components/RememberNoteSheet", () => ({ RememberNoteSheet: "RememberNoteSheet" }));
vi.mock("@/src/lib/keyboard", () => ({ useKeyboardHeight: () => 0 }));
vi.mock("@/src/lib/haptics", () => ({ selection: vi.fn(), tapLight: vi.fn() }));
vi.mock("@/src/lib/recipe-draft", () => ({ setRecipeDraft: vi.fn() }));
// The real code→key table backs the chat error classifier; only the generic helper is stubbed.
vi.mock("expo-secure-store", () => ({ getItemAsync: h.getToken }));
vi.mock("react-native-sse", () => ({
  default: class {
    private errorListener: ((event: { type: string; xhrStatus: number; message: string }) => void) | null = null;
    constructor(_url: string, options: { headers: Record<string, string> }) {
      h.streamHeaders = options.headers;
      h.emitStreamError = () => this.errorListener?.({ type: "error", xhrStatus: 401, message: '{"error":"Unauthorized"}' });
    }
    addEventListener(type: string, listener: NonNullable<typeof this.errorListener>) {
      if (type === "error") this.errorListener = listener;
    }
    removeAllEventListeners() { this.errorListener = null; }
    close() {}
  },
}));
vi.mock("@/src/api/client", async (importOriginal) => ({ ...(await importOriginal<object>()), notifyUnauthorized: h.notifyUnauthorized }));
vi.mock("@/src/lib/api-error", async (importOriginal) => ({ ...(await importOriginal<object>()), apiErrorMessage: () => "error" }));

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
  h.role = "chef_executive";
  h.listening = false;
  h.getToken.mockResolvedValue(null);
  h.streamHeaders = {};
  h.emitStreamError = null;
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

describe("remember a chat message as a chef note", () => {
  const bubbleFor = async (id: string) => {
    const list = screen.root.findAllByType("FlatList" as never)[0]!;
    const item = list.props.data.find((m: { id: string }) => m.id === id);
    let bubble!: ReactTestRenderer;
    await act(async () => { bubble = create(list.props.renderItem({ item })); });
    return bubble;
  };
  const longPressTargets = (bubble: ReactTestRenderer) => bubble.root.findAll((node) => typeof node.type === "string" && typeof node.props.onLongPress === "function");
  const sheet = () => screen.root.findAllByType("RememberNoteSheet" as never)[0];

  it("long-pressing a message opens the sheet with its text; closing it hides the sheet", async () => {
    h.params = { conversationId: "saved-chat" };
    await render();
    expect(sheet()).toBeUndefined();
    const bubble = await bubbleFor("m1");
    await act(async () => { longPressTargets(bubble)[0]!.props.onLongPress(); });
    expect(sheet()!.props.text).toBe("Un plato de berenjena");
    await act(async () => { sheet()!.props.onClose(); });
    expect(sheet()).toBeUndefined();
  });

  it("offers the same action on assistant replies without the hidden recipe payload", async () => {
    h.listMessages.mockResolvedValue([saved[0], { ...saved[1], content: "Berenjena asada\n<recipe_payload>{\"a\":1}</recipe_payload>" }]);
    h.params = { conversationId: "saved-chat" };
    await render();
    const bubble = await bubbleFor("m2");
    expect(longPressTargets(bubble)[0]!.props.accessibilityActions).toEqual([{ name: "longpress", label: "notes_remember" }]);
    await act(async () => { longPressTargets(bubble)[0]!.props.onLongPress(); });
    expect(sheet()!.props.text).not.toContain("recipe_payload");
    expect(sheet()!.props.text).toContain("Berenjena asada");
  });

  it("is not offered to roles that cannot approve recipes", async () => {
    h.role = "sous_chef";
    h.params = { conversationId: "saved-chat" };
    await render();
    expect(longPressTargets(await bubbleFor("m1"))).toHaveLength(0);
  });

  it("is not offered in the preview without a restaurant", async () => {
    h.restaurantId = null;
    await render();
    await send("Prueba sin restaurante");
    const first = screen.root.findAllByType("FlatList" as never)[0]!.props.data[0].id;
    expect(longPressTargets(await bubbleFor(first))).toHaveLength(0);
  });
});

describe("honest chat errors (A3)", () => {
  const streamFailure = (code?: string, status?: number) =>
    Object.assign(new Error(code ?? "stream_error"), { name: "StreamInterruptedError", partialText: "", code, status });
  const texts = () => screen.root.findAll((node) => (node.type as unknown) === "Text").map((node) => node.props.children);
  const actions = (label: string) => screen.root.findAll((node) => (node.type as unknown) === "Pressable" && node.props.accessibilityLabel === label);

  it("shows the coded reason with Retry when retrying can work, without the offline banner or a toast", async () => {
    h.streamMessage.mockRejectedValueOnce(streamFailure("ai_rate_limited"));
    await render();
    await send("Un plato");
    expect(texts()).toContain("error_ai_rate_limited");
    expect(texts()).not.toContain("error_offline_title");
    expect(screen.root.findAllByType("NetworkError" as never)).toHaveLength(0);
    expect(actions("error_retry")).toHaveLength(1);
    expect(h.toast).not.toHaveBeenCalled();
    h.streamMessage.mockResolvedValueOnce("Ahora sí");
    await act(async () => { actions("error_retry")[0]!.props.onPress(); });
    expect(h.streamMessage.mock.calls[1]![6]).toBe(h.streamMessage.mock.calls[0]![6]);
  });

  it.each(["chat_request_conflict", "ai_daily_weekly_limit", "forbidden"])("hides Retry for %s", async (code) => {
    h.streamMessage.mockRejectedValueOnce(streamFailure(code));
    await render();
    await send("Un plato");
    expect(actions("error_retry")).toHaveLength(0);
  });

  it("switches to Diario and resends the same message after the Creativo limit", async () => {
    h.streamMessage.mockRejectedValueOnce(streamFailure("ai_creative_limit"));
    await render();
    await send("Un plato creativo");
    expect(texts()).toContain("ai_creative_limit");
    expect(actions("error_retry")).toHaveLength(0);
    await act(async () => { actions("chat_use_daily")[0]!.props.onPress(); });
    const [first, second] = h.streamMessage.mock.calls;
    expect(first![2]).toBe("creative");
    expect(second!.slice(1, 3)).toEqual(["Un plato creativo", "daily"]);
    expect(second![6]).toBe(first![6]);
    expect(texts()).not.toContain("ai_creative_limit");
  });

  it("offers a new chat when the conversation is too long", async () => {
    h.streamMessage.mockRejectedValueOnce(streamFailure("chat_context_too_long"));
    await render();
    await send("Una pregunta más");
    expect(texts()).toContain("error_chat_context_too_long");
    expect(actions("error_retry")).toHaveLength(0);
    expect(actions("chat_new")).toHaveLength(2);
  });

  it("signs out exactly once after a stream 401: the transport does it, the banner only explains", async () => {
    // The real transport signs out before rejecting; the screen must not do it again.
    h.streamMessage.mockImplementationOnce(async () => {
      h.notifyUnauthorized();
      throw streamFailure(undefined, 401);
    });
    await render();
    await send("Un plato");
    expect(texts()).toContain("error_session_expired");
    expect(actions("error_retry")).toHaveLength(0);
    // The banner offers nothing to press: no dead "sign in" button after the redirect.
    const reason = screen.root.find((node) => (node.type as unknown) === "Text" && node.props.children === "error_session_expired");
    const banner = reason.parent!.parent!;
    expect(banner.findAll((node) => (node.type as unknown) === "Pressable")).toHaveLength(0);
    expect(h.notifyUnauthorized).toHaveBeenCalledTimes(1);
  });

  it.each([
    { token: "test-token", restaurantId: "restaurant-1" },
    { token: null, restaurantId: "restaurant-1" },
    { token: "test-token", restaurantId: null },
    { token: null, restaurantId: null },
  ])("signs out exactly once through the real stream after 401 (token=$token, restaurant=$restaurantId)", async ({ token, restaurantId }) => {
    const transport = await vi.importActual<typeof import("@/src/api/conversations")>("@/src/api/conversations");
    h.getToken.mockResolvedValue(token);
    h.restaurantId = restaurantId;
    h.streamMessage.mockImplementationOnce(transport.streamMessage);
    await render();
    await send("Un plato");
    expect(h.streamMessage).toHaveBeenCalledTimes(1);
    expect(h.streamHeaders.Authorization).toBe(token ? `Bearer ${token}` : undefined);
    expect(h.emitStreamError).not.toBeNull();
    await act(async () => { h.emitStreamError!(); });
    expect(texts()).toContain("error_session_expired");
    expect(actions("error_retry")).toHaveLength(0);
    const reason = screen.root.find((node) => (node.type as unknown) === "Text" && node.props.children === "error_session_expired");
    expect(reason.parent!.parent!.findAll((node) => (node.type as unknown) === "Pressable")).toHaveLength(0);
    await update();
    expect(h.notifyUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("shows a generic translated message for transport errors, never the raw text", async () => {
    h.streamMessage.mockRejectedValueOnce(streamFailure(undefined, 502));
    await render();
    await send("Un plato");
    expect(texts()).toContain("error_ai_provider_failed");
    expect(texts()).not.toContain("stream_error");
    expect(actions("error_retry")).toHaveLength(1);
  });

  it("opening a chat whose last question is unanswered shows a neutral note with Retry", async () => {
    h.listMessages.mockResolvedValueOnce([{ id: "m1", role: "user", content: "¿Y el fondo?", clientMessageId: "cm-1", createdAt: "2026-09-09T10:00:00Z" }]);
    h.params = { conversationId: "saved-chat" };
    await render();
    expect(texts()).toContain("chat_unanswered");
    expect(texts()).not.toContain("error_offline_title");
    await act(async () => { actions("error_retry")[0]!.props.onPress(); });
    expect(h.streamMessage).toHaveBeenCalledWith("saved-chat", "¿Y el fondo?", "creative", expect.any(Function), expect.any(AbortSignal), undefined, "cm-1");
  });

  it("styles the history load failure toast as an error", async () => {
    h.listMessages.mockRejectedValueOnce(new Error("offline"));
    h.params = { conversationId: "saved-chat" };
    await render();
    expect(h.toast).toHaveBeenCalledWith("error", "error");
  });
});

describe("legibility of the pinned idea and the save action", () => {
  // WCAG 2.x contrast ratio, same formula as src/lib/style-preview.ts.
  const contrast = (fg: string, bg: string) => {
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [16, 8, 0].map((shift) => {
        const c = ((n >> shift) & 0xff) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

  it("keeps the pinned idea label, text and icon readable on the chip (WCAG AA)", async () => {
    h.params = { conversationId: "saved-chat", ideaText: "Berenjena" };
    await render();
    const icon = screen.root.findByProps({ name: "pricetag" });
    const chip = icon.parent!;
    const bg = flat(chip.props.style).backgroundColor;
    const [label, idea] = chip.findAllByType("Text" as never);
    expect(contrast(flat(label!.props.style).color, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(flat(idea!.props.style).color, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(icon.props.color, bg)).toBeGreaterThanOrEqual(3);
  });

  // Same pairing as the primary buttons (paper on terracota, about 3:1): the
  // WCAG floor for icons and large text. Small text would need 4.5:1.
  it("keeps the save action label, icon and busy spinner readable on the button", async () => {
    h.params = { conversationId: "saved-chat" };
    h.extract.mockImplementationOnce(() => new Promise(() => {}));
    await render();
    const icon = screen.root.findByProps({ name: "bookmark-outline" });
    const save = icon.parent!;
    const bg = flat(save.props.style).backgroundColor;
    expect(contrast(flat(save.findByType("Text" as never).props.style).color, bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(icon.props.color, bg)).toBeGreaterThanOrEqual(3);
    await act(async () => { save.props.onPress(); });
    const spinner = screen.root.findByType("ActivityIndicator" as never);
    expect(contrast(spinner.props.color, flat(spinner.parent!.props.style).backgroundColor)).toBeGreaterThanOrEqual(3);
  });
});
