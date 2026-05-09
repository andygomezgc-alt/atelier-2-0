import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Empty } from "@/src/components/Empty";
import { NetworkError } from "@/src/components/NetworkError";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import {
  createConversation,
  streamMessage,
  StreamTimeoutError,
  type ChatMessage,
} from "@/src/api/conversations";
import { createRecipe } from "@/src/api/recipes";
import { showToast } from "@/src/components/Toast";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type ModelKey = "sonnet" | "opus";

export default function AsistenteScreen() {
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ ideaId?: string; ideaText?: string }>();

  const ideaId = params.ideaId;
  const ideaText = params.ideaText;

  const userModel: ModelKey =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.defaultModel
      : "sonnet";

  const [model, setModel] = useState<ModelKey>(userModel);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const [streamError, setStreamError] = useState<{ content: string; model: ModelKey } | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  // Reset state when navigating with a new idea.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setModel(userModel);
  }, [userModel]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages, streamBuf]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;
    const conv = await createConversation({ ideaId: ideaId ?? null, modelUsed: model });
    setConversationId(conv.id);
    return conv.id;
  }, [conversationId, ideaId, model]);

  async function runStream(text: string, modelToUse: ModelKey) {
    setStreaming(true);
    setStreamBuf("");
    setStreamError(null);

    try {
      const convId = await ensureConversation();
      let acc = "";
      const full = await streamMessage(convId, text, modelToUse, (delta) => {
        acc += delta;
        setStreamBuf(acc);
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: full || acc,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      if (err instanceof StreamTimeoutError) {
        setStreamError({ content: text, model: modelToUse });
      } else {
        showToast(err instanceof Error ? err.message : t("error_network"));
      }
    } finally {
      setStreaming(false);
      setStreamBuf("");
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    await runStream(text, model);
  }

  async function retryStream() {
    if (!streamError || streaming) return;
    await runStream(streamError.content, streamError.model);
  }

  async function saveAsRecipe() {
    if (messages.length === 0) return;
    // Use the last user message as title hint, last assistant message as content
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const title = (lastUser?.content ?? t("assistant_untitled_recipe")).slice(0, 80);
    const notes = lastAssistant.content.slice(0, 800);

    try {
      const recipe = await createRecipe({
        title,
        contentJson: { ingredients: [], method: [], notes },
        sourceConversationId: conversationId,
      });
      showToast(t("toast_recipe_saved"));
      router.push({ pathname: "/recetas/[id]", params: { id: recipe.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  const showSaveButton =
    !streaming && !streamError && messages.some((m) => m.role === "assistant") && conversationId;

  return (
    <Screen title={t("header_asistente")}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        {ideaText ? (
          <View style={styles.pinChip}>
            <Ionicons name="pricetag" size={12} color={colors.terracota} />
            <Text style={styles.pinLabel}>{t("chat_idea_anclada")}</Text>
            <Text style={styles.pinText} numberOfLines={1}>
              {ideaText}
            </Text>
          </View>
        ) : null}

        <View style={styles.modelRow}>
          <Pressable
            style={[styles.modelChip, model === "sonnet" && styles.modelChipActive]}
            onPress={() => setModel("sonnet")}
          >
            <Text style={[styles.modelLabel, model === "sonnet" && styles.modelLabelActive]}>
              Sonnet 4.6
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modelChip, model === "opus" && styles.modelChipActive]}
            onPress={() => setModel("opus")}
          >
            <Text style={[styles.modelLabel, model === "opus" && styles.modelLabelActive]}>
              Opus 4.7
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <Empty
              icon="chatbubble-outline"
              title={t("empty_chat_title")}
              sub={t("empty_chat_sub")}
            />
          ) : (
            messages.map((m) => (
              <View
                key={m.id}
                style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}
              >
                <Text style={styles.bubbleRole}>
                  {m.role === "user" ? t("chat_role_user") : t("chat_role_assistant")}
                </Text>
                <Text style={styles.bubbleText}>{m.content}</Text>
              </View>
            ))
          )}
          {streaming && streamBuf ? (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <Text style={styles.bubbleRole}>{t("chat_role_assistant")}</Text>
              <Text style={styles.bubbleText}>{streamBuf}</Text>
            </View>
          ) : null}
        </ScrollView>

        {streamError ? (
          <View style={styles.errorBanner}>
            <NetworkError onRetry={retryStream} />
          </View>
        ) : null}

        {showSaveButton ? (
          <Pressable style={styles.saveAction} onPress={saveAsRecipe}>
            <Ionicons name="bookmark-outline" size={14} color={colors.terracota} />
            <Text style={styles.saveActionLabel}>{t("chat_save_recipe")}</Text>
          </Pressable>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("chat_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.composerInput}
            multiline
            editable={!streaming}
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || streaming}
          >
            <Ionicons name="arrow-up" size={18} color={colors.paper} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pinChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.terracotaSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderRadius: radii.pill,
  },
  pinLabel: {
    fontFamily: fonts.sans,
    fontSize: 10.5,
    color: colors.terracota,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  pinText: {
    flex: 1,
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.bodySm,
    color: colors.ink,
  },
  modelRow: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  modelChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paperSoft,
  },
  modelChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  modelLabel: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.inkSoft },
  modelLabelActive: { color: colors.paper, fontWeight: "600" },
  messages: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  bubble: {
    borderRadius: radii.md,
    padding: spacing.md,
    maxWidth: "90%",
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: colors.tealSoft,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
  },
  bubbleRole: {
    fontFamily: fonts.sans,
    fontSize: 9,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  bubbleText: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.body,
    color: colors.ink,
    lineHeight: fontSizes.body * 1.5,
  },
  errorBanner: {
    height: 200,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
  },
  saveAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.terracotaSoft,
    marginBottom: spacing.sm,
  },
  saveActionLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    fontWeight: "600",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
    backgroundColor: colors.paper,
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    maxHeight: 120,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.terracota,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
