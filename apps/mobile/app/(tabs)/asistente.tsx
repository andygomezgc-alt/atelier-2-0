import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Empty } from "@/src/components/Empty";
import { NetworkError } from "@/src/components/NetworkError";
import { PreviousChatsSheet } from "@/src/components/PreviousChatsSheet";
import { ProfileSheet } from "@/src/components/ProfileSheet";
import { ensureRestaurant } from "@/src/components/LazyRestaurantHost";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import {
  bulkAddMessages,
  createConversation,
  getConversationByIdea,
  listMessages,
  streamMessage,
  StreamTimeoutError,
  type ChatMessage,
} from "@/src/api/conversations";
import { extractRecipeFromAssistant } from "@/src/api/recipes";
import { showToast } from "@/src/components/Toast";
import { stripRecipePayload } from "@/src/lib/recipe-payload";
import { setRecipeDraft } from "@/src/lib/recipe-draft";
import { highlightQuantities } from "@/src/lib/highlight-quantities";
import type { TranslationKey } from "@atelier/i18n";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type ModelKey = "haiku" | "sonnet" | "opus";

const MODEL_LABEL_KEYS: Record<ModelKey, TranslationKey> = {
  haiku: "model_haiku",
  sonnet: "model_sonnet",
  opus: "model_opus",
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

// C-05 — Texto del cuerpo del bubble del asistente con cantidades/temperaturas
// resaltadas en terracota negrita (como en el mockup: "70°C / 11h 30m" en bold).
function HighlightedText({ text }: { text: string }) {
  const tokens = useMemo(() => highlightQuantities(text), [text]);
  return (
    <Text style={styles.assistantBody}>
      {tokens.map((tok, i) =>
        tok.type === "qty" ? (
          <Text key={i} style={styles.qtyHighlight}>
            {tok.text}
          </Text>
        ) : (
          tok.text
        ),
      )}
    </Text>
  );
}

// A-03 — Bubble memoizada. Refs estables desde el padre (Bubble vive afuera
// del componente, los handlers y datos son estables por mensaje) evitan
// re-render del resto de la lista cuando llega un delta nuevo.
const Bubble = memo(function Bubble({
  m,
  eyebrowLabel,
}: {
  m: ChatMessage;
  eyebrowLabel: string;
}) {
  if (m.role === "user") {
    return (
      <View style={styles.userWrap}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{m.content}</Text>
        </View>
        <Text style={styles.userTime}>{formatTime(m.createdAt)}</Text>
      </View>
    );
  }
  const stripped = stripRecipePayload(m.content).trim();
  const lines = stripped.split(/\r?\n/);
  const titleLine = lines[0] ?? "";
  const restText = lines.slice(1).join("\n").trim();
  // Heurística simple: si la primera línea es corta y no termina en "." o ":",
  // se trata como título de receta (mockup la muestra serif itálico bold).
  const isTitle =
    lines.length > 1 &&
    titleLine.length > 0 &&
    titleLine.length < 80 &&
    !/[.:]\s*$/.test(titleLine);
  return (
    <View style={styles.assistantWrap}>
      <Text style={styles.assistantEyebrow}>{eyebrowLabel}</Text>
      <View style={styles.assistantBubble}>
        {isTitle ? (
          <>
            <Text style={styles.assistantTitle}>{titleLine}</Text>
            {restText ? <HighlightedText text={restText} /> : null}
          </>
        ) : (
          <HighlightedText text={stripped} />
        )}
      </View>
    </View>
  );
});

export default function AsistenteScreen() {
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    ideaId?: string;
    ideaText?: string;
    conversationId?: string;
  }>();

  const ideaId = params.ideaId;
  const ideaText = params.ideaText;
  const conversationIdParam = params.conversationId;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const userModel: ModelKey =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.defaultModel
      : "sonnet";

  const userName =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.name
      : "";
  const userInitials = userName ? initials(userName) : "?";

  // A-12 — el Asistente funciona igual con o sin restaurante. Sin restaurante
  // no creamos Conversation en server; los mensajes viven en memoria y se
  // persisten todos juntos al guardar como receta.
  const hasRestaurant =
    (authState.status === "signed-in" || authState.status === "needs-restaurant") &&
    Boolean(authState.user.restaurantId);

  const [model, setModel] = useState<ModelKey>(userModel);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [structuring, setStructuring] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const [streamError, setStreamError] = useState<{ content: string; model: ModelKey } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Initialize the model preference once.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setModel(userModel);
  }, [userModel]);

  // Cancel any in-flight stream when the screen unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Reset chat state and load the right conversation when params change.
  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setStreamBuf("");
    setStreamError(null);

    let cancelled = false;

    if (conversationIdParam) {
      (async () => {
        try {
          const msgs = await listMessages(conversationIdParam);
          if (cancelled) return;
          setConversationId(conversationIdParam);
          setMessages(msgs);
        } catch (err) {
          if (cancelled) return;
          showToast(err instanceof Error ? err.message : t("error_network"));
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (ideaId) {
      (async () => {
        try {
          const conv = await getConversationByIdea(ideaId);
          if (cancelled) return;
          setConversationId(conv.id);
          setMessages(conv.messages);
        } catch (err) {
          if (cancelled) return;
          showToast(err instanceof Error ? err.message : t("error_network"));
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [ideaId, conversationIdParam, t]);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (conversationId) return conversationId;
    if (!hasRestaurant) return null;
    const conv = await createConversation({ ideaId: ideaId ?? null, modelUsed: model });
    setConversationId(conv.id);
    return conv.id;
  }, [conversationId, ideaId, model, hasRestaurant]);

  async function runStream(text: string, modelToUse: ModelKey) {
    setStreaming(true);
    setStreamBuf("");
    setStreamError(null);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const convId = await ensureConversation();
      let acc = "";
      const previewHistory = convId
        ? undefined
        : messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content }));
      const full = await streamMessage(
        convId,
        text,
        modelToUse,
        (delta) => {
          acc += delta;
          setStreamBuf(acc);
        },
        ac.signal,
        previewHistory,
      );
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
      if (err instanceof Error && err.name === "AbortError") return;
      if (err instanceof StreamTimeoutError) {
        setStreamError({ content: text, model: modelToUse });
      } else {
        showToast(err instanceof Error ? err.message : t("error_network"));
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
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

  // Sin restaurante, ensureConversationForSave hace lazy-create + crea
  // Conversation real + sube messages locales con bulk antes de seguir.
  async function ensureConversationForSave(): Promise<string | null> {
    if (conversationId) return conversationId;
    try {
      await ensureRestaurant();
    } catch {
      return null;
    }
    const conv = await createConversation({
      ideaId: ideaId ?? null,
      modelUsed: model,
    });
    setConversationId(conv.id);
    const toUpload = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
    if (toUpload.length > 0) {
      try {
        await bulkAddMessages(conv.id, toUpload);
      } catch {
        // Si bulk falla, la receta se sigue guardando con sourceConversationId
        // apuntando a la Conversation creada (sin history); no se pierde la
        // receta. Aceptable.
      }
    }
    return conv.id;
  }

  async function saveAsRecipe() {
    if (messages.length === 0) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    setStructuring(true);
    try {
      const convId = await ensureConversationForSave();
      if (!convId) {
        setStructuring(false);
        return;
      }

      // Bloque 3 (Opción A) — el system prompt ya NO le pide al modelo emitir
      // <recipe_payload>. El guardado siempre pasa por la extracción Haiku
      // (validada 10/10 en A-01), que estructura el texto visible en el JSON
      // que el form espera. Robusto frente al cap de effort:low de Sonnet.
      // stripRecipePayload() queda como defensivo por si un mensaje histórico
      // todavía trae un payload viejo persistido en DB.
      const recipeText = stripRecipePayload(lastAssistant.content);
      try {
        const ex = await extractRecipeFromAssistant(recipeText);
        setRecipeDraft({
          title: ex.title,
          contentJson: ex.contentJson,
          recipeIngredients: ex.recipeIngredients,
          pendingMatches: ex.pendingMatches,
          sourceConversationId: convId,
        });
        router.push("/recetas/nueva");
      } catch {
        Alert.alert(t("extract_fail_title"), t("extract_fail_body"), [
          {
            text: t("extract_fail_draft"),
            onPress: () => {
              setRecipeDraft({
                title: t("recipe_untitled"),
                contentJson: {
                  ingredients: [],
                  method: [],
                  notes: recipeText.slice(0, 5000),
                },
                sourceConversationId: convId,
              });
              router.push("/recetas/nueva");
            },
          },
          { text: t("extract_fail_cancel"), style: "cancel" },
        ]);
      }
    } finally {
      setStructuring(false);
    }
  }

  // A-03 — FlatList invertida: data en orden inverso así el último mensaje
  // queda visualmente abajo. inverted + ListHeaderComponent garantiza que
  // el bubble en progreso / "Atelier piensa" siempre quede al fondo del
  // scroll sin scrollToEnd manual.
  const reversedData = useMemo(() => [...messages].slice().reverse(), [messages]);

  const assistantEyebrow = t("assistant_eyebrow");
  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => <Bubble m={item} eyebrowLabel={assistantEyebrow} />,
    [assistantEyebrow],
  );
  const keyExtractor = useCallback((m: ChatMessage) => m.id, []);

  // A-05 — indicador discreto cuando el modelo todavía no escupió el primer
  // delta. Aparece debajo del último mensaje del chef y desaparece apenas
  // llega texto.
  const awaitingFirstDelta = streaming && streamBuf.length === 0;
  const showSaveButton =
    !streaming && !streamError && messages.some((m) => m.role === "assistant");

  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      {/* HEADER del mockup: eyebrow + saludo serif italiano + pill historial + avatar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerEyebrow}>{t("header_asistente_eyebrow")}</Text>
          <Text style={styles.headerGreet}>{t("chat_greet")}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.historyPill}
            onPress={() => setHistoryOpen(true)}
            accessibilityLabel={t("chat_history")}
          >
            <Ionicons name="time-outline" size={14} color={colors.ink} />
            <Text style={styles.historyLabel}>{t("chat_history")}</Text>
          </Pressable>
          <Pressable
            style={styles.avatar}
            onPress={() => setProfileOpen(true)}
            accessibilityLabel={userName}
          >
            <Text style={styles.avatarText}>{userInitials}</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.divider} />

      <PreviousChatsSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onPick={(conv) => {
          router.replace({
            pathname: "/(tabs)/asistente",
            params: {
              conversationId: conv.id,
              ...(conv.ideaText ? { ideaText: conv.ideaText } : {}),
            },
          });
        }}
      />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        {ideaText ? (
          <View style={styles.pinChip}>
            <Ionicons name="pricetag" size={12} color={colors.teal} style={styles.pinIcon} />
            <View style={styles.pinTextWrap}>
              <Text style={styles.pinLabel}>{t("chat_idea_anclada")}</Text>
              <Text style={styles.pinText}>{ideaText}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.modelRow}>
          {(["haiku", "sonnet", "opus"] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.modelChip, model === m && styles.modelChipActive]}
              onPress={() => setModel(m)}
            >
              <Text style={[styles.modelLabel, model === m && styles.modelLabelActive]}>
                {t(MODEL_LABEL_KEYS[m])}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flex: 1 }}>
          {messages.length === 0 && !streaming ? (
            <Empty
              icon="chatbubble-outline"
              title={t("empty_chat_title")}
              sub={t("empty_chat_sub")}
            />
          ) : (
            <FlatList
              data={reversedData}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              inverted
              contentContainerStyle={styles.messages}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              windowSize={11}
              removeClippedSubviews
              ListHeaderComponent={
                streaming && streamBuf ? (
                  <View style={styles.assistantWrap}>
                    <Text style={styles.assistantEyebrow}>{assistantEyebrow}</Text>
                    <View style={styles.assistantBubble}>
                      <HighlightedText text={stripRecipePayload(streamBuf)} />
                    </View>
                  </View>
                ) : awaitingFirstDelta ? (
                  <Text style={styles.thinking}>{t("chat_thinking")} •••</Text>
                ) : null
              }
            />
          )}
        </View>

        {streamError ? (
          <View style={styles.errorBanner}>
            <NetworkError onRetry={retryStream} />
          </View>
        ) : null}

        {showSaveButton ? (
          <View style={styles.saveStack}>
            <Pressable
              style={[styles.saveAction, structuring && { opacity: 0.6 }]}
              onPress={saveAsRecipe}
              disabled={structuring}
            >
              {structuring ? (
                <ActivityIndicator size="small" color={colors.terracota} />
              ) : (
                <Ionicons name="bookmark-outline" size={14} color={colors.terracota} />
              )}
              <Text style={styles.saveActionLabel}>
                {structuring ? t("chat_structuring") : t("chat_save_recipe")}
              </Text>
            </Pressable>
            {!hasRestaurant ? (
              <Text style={styles.saveHint}>{t("chat_save_needs_restaurant")}</Text>
            ) : null}
          </View>
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
            accessibilityLabel="send"
          >
            <Ionicons name="send" size={16} color={colors.paper} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },

  // ── Header del mockup ───────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerLeft: { flex: 1, gap: 4 },
  headerEyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    letterSpacing: 1.4,
  },
  headerGreet: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifXl,
    color: colors.ink,
    lineHeight: fontSizes.serifXl * 1.2,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  historyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  historyLabel: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodySm,
    color: colors.ink,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: "600",
    color: colors.paper,
    letterSpacing: 0.5,
  },
  divider: {
    height: 0.5,
    backgroundColor: colors.edge,
    marginHorizontal: spacing.xl,
  },

  // ── Idea anclada (chip) ─────────────────────────────────────────────
  // Bloque 4 · C-03 — el chip de "iniciar conversación" es afirmación pasiva
  // (la idea ya se ancló al chat, no hay que tomar acción), por eso tealSoft
  // en lugar de terracotaSoft.
  pinChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.tealSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderRadius: radii.md,
  },
  pinIcon: { marginTop: 2 },
  pinTextWrap: { flex: 1, flexShrink: 1 },
  pinLabel: {
    fontFamily: fonts.sans,
    fontSize: 10.5,
    color: colors.teal,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  pinText: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodySm,
    color: colors.ink,
    lineHeight: fontSizes.bodySm * 1.4,
  },

  // ── Chips de modelo (Sous-chef / Creativo / Ejecutivo) ──────────────
  modelRow: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  modelChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paper,
  },
  modelChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  modelLabel: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.inkSoft },
  modelLabelActive: { color: colors.paper, fontWeight: "600" },

  // ── Messages container ──────────────────────────────────────────────
  messages: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },

  // ── Bubble del chef (verde teal, derecha, hora abajo) ───────────────
  userWrap: { alignItems: "flex-end", gap: 4 },
  userBubble: {
    backgroundColor: colors.teal,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    maxWidth: "85%",
  },
  userText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.paper,
    lineHeight: fontSizes.body * 1.5,
  },
  userTime: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginRight: spacing.xs,
  },

  // ── Bubble del asistente (tarjeta crema, eyebrow + título + body) ───
  assistantWrap: { alignItems: "flex-start", gap: spacing.xs },
  assistantEyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    letterSpacing: 1.4,
    paddingHorizontal: spacing.xs,
  },
  assistantBubble: {
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.lg,
    padding: spacing.md,
    maxWidth: "92%",
  },
  assistantTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodyLg + 2,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  assistantBody: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    lineHeight: fontSizes.body * 1.6,
  },
  qtyHighlight: {
    color: colors.terracota,
    fontWeight: "700",
  },

  // ── "Atelier piensa •••" (A-05) ─────────────────────────────────────
  thinking: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodySm,
    color: colors.mute,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },

  // ── Error banner ────────────────────────────────────────────────────
  errorBanner: {
    height: 200,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
  },

  // ── Save action ────────────────────────────────────────────────────
  saveStack: { alignItems: "center", gap: 4, marginBottom: spacing.sm },
  saveAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.terracotaSoft,
  },
  saveActionLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    fontWeight: "600",
  },
  saveHint: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },

  // ── Composer (input redondeado grande + botón terracota; SIN mic) ──
  composer: {
    flexDirection: "row",
    alignItems: "center",
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
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.terracota,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
