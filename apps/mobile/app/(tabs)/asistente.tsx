import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, withSpring, withTiming } from "react-native-reanimated";
import type { EntryExitAnimationFunction } from "react-native-reanimated";

import { Empty } from "@/src/components/Empty";
import { NetworkError } from "@/src/components/NetworkError";
import { PreviousChatsSheet } from "@/src/components/PreviousChatsSheet";
import { ProfileSheet } from "@/src/components/ProfileSheet";
import { ensureRestaurant } from "@/src/components/LazyRestaurantHost";
import { useI18n, dateLocale } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { speechAvailable, useSpeechInput } from "@/src/hooks/useSpeechInput";
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
import { MarkdownText } from "@/src/components/MarkdownText";
import { TypingDots } from "@/src/components/TypingDots";
import { SendButton } from "@/src/components/SendButton";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { selection, tapLight } from "@/src/lib/haptics";
import type { TranslationKey } from "@atelier/i18n";
import { colors, fonts, fontSizes, radii, spacing, TAB_BAR_BASE_HEIGHT } from "@/src/theme";

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

// Dictado por voz: app lang → BCP-47 del reconocedor nativo.
const SPEECH_LANG: Record<"es" | "it" | "en", string> = {
  es: "es-ES",
  it: "it-IT",
  en: "en-US",
};

// Separador de día (pulido spec 2026-06-23): "hoy" / "ayer" / "12 jun".
function dayLabel(
  iso: string,
  t: (k: TranslationKey) => string,
  locale: string,
): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const startOf = (x: Date) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
    if (diff <= 0) return t("day_today");
    if (diff === 1) return t("day_yesterday");
    // Idioma del chef, no el del teléfono.
    return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

// Entrada "con más vida" (spec): fade + sube 14px + scale desde 0.97, spring
// con mini rebote. Worklet custom porque FadeInDown no trae scale.
const messageEntering: EntryExitAnimationFunction = () => {
  "worklet";
  const SPRING = { damping: 14, stiffness: 170, mass: 0.8 };
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: 14 }, { scale: 0.97 }],
    },
    animations: {
      opacity: withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
      transform: [
        { translateY: withSpring(0, SPRING) },
        { scale: withSpring(1, SPRING) },
      ],
    },
  };
};

// A-03 — Bubble memoizada (igual que antes). `animate` solo es true para
// mensajes que llegan en vivo; el historial carga quieto.
const Bubble = memo(function Bubble({
  m,
  eyebrowLabel,
  animate,
}: {
  m: ChatMessage;
  eyebrowLabel: string;
  animate: boolean;
}) {
  if (m.role === "user") {
    const inner = (
      <>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{m.content}</Text>
        </View>
        <Text style={styles.userTime}>{formatTime(m.createdAt)}</Text>
      </>
    );
    return animate ? (
      <Animated.View entering={messageEntering} style={styles.userWrap}>
        {inner}
      </Animated.View>
    ) : (
      <View style={styles.userWrap}>{inner}</View>
    );
  }
  const inner = (
    <>
      <Text style={styles.assistantEyebrow}>{eyebrowLabel}</Text>
      <View style={styles.assistantRule} />
      <View style={styles.assistantBody}>
        <MarkdownText text={stripRecipePayload(m.content).trim()} />
      </View>
    </>
  );
  return animate ? (
    <Animated.View entering={messageEntering} style={styles.assistantWrap}>
      {inner}
    </Animated.View>
  ) : (
    <View style={styles.assistantWrap}>{inner}</View>
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

  const kb = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  // El teclado cubre la tab bar: solo hay que compensar lo que sobresale de ella.
  const kbPad = Math.max(0, kb - (TAB_BAR_BASE_HEIGHT + insets.bottom));

  const userModel: ModelKey =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.defaultModel
      : "sonnet";

  const userName =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.name
      : "";
  const userInitials = userName ? initials(userName) : "?";

  const langPref: "es" | "it" | "en" =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.languagePref
      : "es";

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
  const [streamShown, setStreamShown] = useState("");
  const [streamError, setStreamError] = useState<{ content: string; model: ModelKey } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Typewriter: los deltas de red se acumulan en streamTargetRef; un ticker los
  // revela de a pocos caracteres por frame para que la respuesta se "escriba"
  // fluida en vez de aparecer a golpes de chunk.
  const streamTargetRef = useRef("");
  const streamShownRef = useRef("");
  const streamDoneRef = useRef(false);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drainResolveRef = useRef<(() => void) | null>(null);
  // Se incrementa al cambiar de idea/conversación; un runStream con generación
  // vieja no debe commitear su respuesta en el chat nuevo ni pisar su estado.
  const streamGenRef = useRef(0);

  // Dictado por voz: el texto reconocido se vuelca en el input en vivo.
  const { listening, start: startMic, stop: stopMic } = useSpeechInput({
    lang: SPEECH_LANG[langPref] ?? "es-ES",
    onText: setInput,
    onError: (code) =>
      showToast(
        t(code === "permission" ? "error_mic_permission" : "error_mic_unavailable"),
      ),
  });

  // Los mensajes presentes al cargar la conversación NO se animan; solo los
  // que llegan en vivo. Set de ids conocidos al momento del load.
  const preloadedIds = useRef<Set<string>>(new Set());

  function stopTicker() {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }

  // El paso escala con el backlog: nunca se atrasa más de ~medio segundo
  // respecto de la red, pero mantiene un mínimo de ritmo "typewriter".
  function startTicker() {
    if (tickerRef.current) return;
    tickerRef.current = setInterval(() => {
      const target = streamTargetRef.current;
      const shown = streamShownRef.current;
      if (shown.length < target.length) {
        const backlog = target.length - shown.length;
        const step = Math.max(3, Math.ceil(backlog / 12));
        let end = shown.length + step;
        // No partir un par sustituto (emoji) en el borde del reveal.
        const code = target.charCodeAt(end - 1);
        if (end < target.length && code >= 0xd800 && code <= 0xdbff) end += 1;
        const next = target.slice(0, end);
        streamShownRef.current = next;
        setStreamShown(next);
      } else {
        // Alcanzó: parar en vez de idlear; cada delta nuevo lo reinicia.
        stopTicker();
        if (streamDoneRef.current) {
          drainResolveRef.current?.();
          drainResolveRef.current = null;
        }
      }
    }, 33);
  }

  function resetStream() {
    stopTicker();
    // Desbloquea un drain pendiente para que runStream no cuelgue si cambia la
    // idea a mitad del reveal; el caller ya capturó su texto final.
    drainResolveRef.current?.();
    drainResolveRef.current = null;
    streamTargetRef.current = "";
    streamShownRef.current = "";
    streamDoneRef.current = false;
    setStreamShown("");
  }

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
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  // Reset chat state and load the right conversation when params change.
  useEffect(() => {
    // Mata cualquier stream en vuelo de la idea anterior; sin esto su respuesta
    // sigue escribiéndose (y se commitearía) en el chat nuevo.
    streamGenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setConversationId(null);
    setMessages([]);
    resetStream();
    setStreamError(null);
    preloadedIds.current = new Set();

    let cancelled = false;

    if (conversationIdParam) {
      (async () => {
        try {
          const msgs = await listMessages(conversationIdParam);
          if (cancelled) return;
          setConversationId(conversationIdParam);
          preloadedIds.current = new Set(msgs.map((m) => m.id));
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
          preloadedIds.current = new Set(conv.messages.map((m) => m.id));
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
    const gen = streamGenRef.current;
    setStreaming(true);
    resetStream();
    setStreamError(null);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const convId = await ensureConversation();
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
          if (streamTargetRef.current === "") selection();
          streamTargetRef.current += delta;
          startTicker();
        },
        ac.signal,
        previewHistory,
      );
      if (gen !== streamGenRef.current) return;
      const finalText = full || streamTargetRef.current;
      streamTargetRef.current = finalText;
      // Dejar que el typewriter alcance antes de swappear al bubble final,
      // si no el final de la respuesta aparece de golpe.
      streamDoneRef.current = true;
      if (streamShownRef.current.length < finalText.length) {
        startTicker();
        await new Promise<void>((resolve) => {
          drainResolveRef.current = resolve;
        });
        if (gen !== streamGenRef.current) return;
      }
      // Pre-marcar el id como "preloaded" para que el bubble commiteado NO
      // re-corra la animación de entrada (el usuario ya lo vio escribirse).
      const id = `assistant-${Date.now()}`;
      preloadedIds.current.add(id);
      setMessages((prev) => [
        ...prev,
        {
          id,
          role: "assistant",
          content: finalText,
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
      // Generación vieja = la idea cambió y ya reseteó este estado para el chat
      // nuevo; no lo pises.
      if (gen === streamGenRef.current) {
        setStreaming(false);
        resetStream();
      }
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    tapLight();
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

  function handleMic() {
    if (streaming) return;
    if (listening) {
      stopMic();
      return;
    }
    tapLight();
    startMic(input);
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
    ({ item }: { item: ChatMessage }) => (
      <Bubble
        m={item}
        eyebrowLabel={assistantEyebrow}
        animate={!preloadedIds.current.has(item.id)}
      />
    ),
    [assistantEyebrow],
  );
  const keyExtractor = useCallback((m: ChatMessage) => m.id, []);

  // A-05 — indicador discreto cuando el modelo todavía no escupió el primer
  // delta. Aparece debajo del último mensaje del chef y desaparece apenas
  // llega texto.
  const awaitingFirstDelta = streaming && streamShown.length === 0;
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

      <View style={{ flex: 1 }}>
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
                streaming && streamShown ? (
                  <View style={styles.assistantWrap}>
                    <Text style={styles.assistantEyebrow}>{assistantEyebrow}</Text>
                    <View style={styles.assistantRule} />
                    <View style={styles.assistantBody}>
                      <MarkdownText text={stripRecipePayload(streamShown)} />
                    </View>
                  </View>
                ) : awaitingFirstDelta ? (
                  <View style={styles.assistantWrap}>
                    <Text style={styles.assistantEyebrow}>{assistantEyebrow}</Text>
                    <View style={styles.assistantRule} />
                    <TypingDots />
                  </View>
                ) : null
              }
              ListFooterComponent={
                messages.length > 0 ? (
                  <View style={styles.daySep}>
                    <Text style={styles.dayChip}>
                      {dayLabel(messages[0].createdAt, t, dateLocale(langPref))}
                    </Text>
                  </View>
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
          {/* Sin el módulo nativo (Expo Go) el mic se esconde; en el APK está. */}
          {speechAvailable ? (
            <Pressable
              onPress={handleMic}
              disabled={streaming}
              style={[
                styles.micBtn,
                listening && styles.micBtnActive,
                streaming && styles.micBtnDisabled,
              ]}
              accessibilityLabel={listening ? t("chat_mic_stop") : t("chat_mic_label")}
            >
              <Ionicons
                name={listening ? "stop" : "mic-outline"}
                size={18}
                color={listening ? colors.paper : colors.terracota}
              />
            </Pressable>
          ) : null}
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("chat_placeholder_voice")}
            placeholderTextColor={colors.mute}
            style={styles.composerInput}
            multiline
            editable={!streaming}
          />
          <SendButton
            disabled={!input.trim() || streaming}
            streaming={streaming}
            onPress={handleSend}
          />
        </View>
        {/* Empuja el composer por encima del teclado (Android edge-to-edge). */}
        <View style={{ height: kbPad }} />
      </View>
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
    // Pulido (spec 2026-06-23): más aire entre mensajes.
    gap: 28,
  },

  // ── Separador de día (chip discreto al tope de la conversación) ──────
  daySep: { alignItems: "center", marginBottom: spacing.lg, marginTop: spacing.xs },
  dayChip: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    backgroundColor: colors.paperWarm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    overflow: "hidden",
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

  // ── Bubble del asistente (eyebrow + regla + body) ───────────────────
  assistantWrap: { alignItems: "flex-start", gap: spacing.xs },
  assistantEyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    letterSpacing: 1.4,
    paddingHorizontal: spacing.xs,
  },
  // ── Mensaje del asistente: cuaderno editorial (sin tarjeta) ──────────
  assistantRule: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.terracota,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  assistantBody: {
    maxWidth: "94%",
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

  // ── Micrófono (dictado por voz) ─────────────────────────────────────
  micBtn: {
    // Objetivo táctil mínimo recomendado 44px (accesibilidad). Antes 38.
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.terracota,
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnActive: { backgroundColor: colors.terracota, borderColor: colors.terracota },
  micBtnDisabled: { opacity: 0.4 },
});
