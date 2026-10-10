import { can, normalizeChatMode, type ChatMode } from "@atelier/shared";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Empty } from "@/src/components/Empty";
import { NetworkError } from "@/src/components/NetworkError";
import { PreviousChatsSheet } from "@/src/components/PreviousChatsSheet";
import { ProfileSheet } from "@/src/components/ProfileSheet";
import { RememberNoteSheet } from "@/src/components/RememberNoteSheet";
import { useI18n, dateLocale } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import type { ChatMessage } from "@/src/api/conversations";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { tapLight } from "@/src/lib/haptics";
import { stripRecipePayload } from "@/src/lib/recipe-payload";
import { canRememberNote } from "@/src/lib/chef-notes";
import type { ChatErrorAction } from "@/src/lib/chat-error";
import { colors, TAB_BAR_BASE_HEIGHT } from "@/src/theme";
import { styles } from "@/src/features/assistant/chat-styles";
import { createClientMessageId, dayLabel, initials } from "@/src/features/assistant/chat-helpers";
import { useChatComposer } from "@/src/features/assistant/use-chat-composer";
import { useChatConversation } from "@/src/features/assistant/use-chat-conversation";
import { useChatTurn } from "@/src/features/assistant/use-chat-turn";
import { useSaveRecipe } from "@/src/features/assistant/use-save-recipe";
import { MessageBubble } from "@/src/features/assistant/components/MessageBubble";
import { StreamingBubble } from "@/src/features/assistant/components/StreamingBubble";
import { ChatFailureBanner } from "@/src/features/assistant/components/ChatFailureBanner";
import { ModelSwitch } from "@/src/features/assistant/components/ModelSwitch";
import { Composer } from "@/src/features/assistant/components/Composer";

export default function AsistenteScreen() {
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    ideaId?: string;
    ideaText?: string;
    conversationId?: string;
    chatSession?: string;
  }>();

  const ideaId = params.ideaId;
  const ideaText = params.ideaText;
  const conversationIdParam = params.conversationId;
  const chatSession = params.chatSession;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [rememberText, setRememberText] = useState<string | null>(null);

  const kb = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  // El teclado cubre la tab bar: solo hay que compensar lo que sobresale de ella.
  const kbPad = Math.max(0, kb - (TAB_BAR_BASE_HEIGHT + insets.bottom));

  const chefRole =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : null;
  // El Creativo (modelo caro) es del admin y del chef ejecutivo; el sous-chef
  // usa el Diario. El servidor rechaza igual si alguien fuerza el modo.
  const puedeCreativo = chefRole != null && can(chefRole, "use_creative_chat");

  const modeloPreferido: ChatMode =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? normalizeChatMode(authState.user.defaultModel)
      : "daily";
  // Una preferencia vieja de Creativo no vale si el rol ya no lo permite.
  const userModel: ChatMode = puedeCreativo ? modeloPreferido : "daily";

  const userName =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.name
      : "";
  const userInitials = userName ? initials(userName) : "?";
  const userPhotoUrl =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.photoUrl
      : null;

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
  // "Recordar esto" (notas del chef): solo con restaurante real y `approve_recipe`.
  const canRemember = canRememberNote(
    chefRole,
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.restaurantId
      : null,
  );

  // Order: the composer, then the conversation (owns the session generation), then the turn and the save.
  // The route-change callbacks reach the turn through `turn`, declared below; they run after this render.
  const composer = useChatComposer(langPref);
  const conversation = useChatConversation({
    ideaId,
    conversationIdParam,
    chatSession,
    hasRestaurant,
    userModel,
    t,
    onSwitch: () => {
      turn.reset();
      composer.setInput("");
    },
    onUnansweredQuestion: (question) => turn.restoreUnanswered(question),
  });
  const turn = useChatTurn({
    generation: conversation.generation,
    messages: conversation.messages,
    setMessages: conversation.setMessages,
    ensureConversation: conversation.ensureConversation,
    preloadedIds: conversation.preloadedIds,
    setModel: conversation.setModel,
  });
  const save = useSaveRecipe({
    messages: conversation.messages,
    conversationId: conversation.conversationId,
    generation: conversation.generation,
    promoteChat: conversation.promoteChat,
    isBlocked: () => turn.busy || turn.failed !== null || conversation.switchingRef.current,
    t,
  });

  const busy = turn.busy;
  // While stopping, the partial text is already discarded: no streaming bubble.
  const streamingVisible = busy && turn.phase !== "stopping";
  const composerBusy = busy || save.structuring || conversation.loading || conversation.loadError;
  const navigationBusy = busy || save.structuring || composer.listening;
  const showSaveButton =
    turn.phase === "idle" && conversation.messages.some((m) => m.role === "assistant");

  // A-03 — FlatList invertida: data en orden inverso así el último mensaje
  // queda visualmente abajo. inverted + ListHeaderComponent garantiza que
  // el bubble en progreso / "Atelier piensa" siempre quede al fondo del
  // scroll sin scrollToEnd manual.
  const reversedData = useMemo(() => [...conversation.messages].reverse(), [conversation.messages]);

  const assistantEyebrow = t("assistant_eyebrow");
  const rememberLabel = t("notes_remember");
  const openRemember = useCallback((m: ChatMessage) => {
    Keyboard.dismiss();
    tapLight();
    setRememberText(m.role === "assistant" ? stripRecipePayload(m.content) : m.content);
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        m={item}
        eyebrowLabel={assistantEyebrow}
        animate={!conversation.preloadedIds.current.has(item.id)}
        onRemember={canRemember ? openRemember : undefined}
        rememberLabel={rememberLabel}
      />
    ),
    [assistantEyebrow, canRemember, openRemember, rememberLabel],
  );
  const keyExtractor = useCallback((m: ChatMessage) => m.id, []);

  function changeConversation(action: () => void) {
    if (navigationBusy || conversation.switchingRef.current || turn.inFlight()) return;
    const proceed = () => {
      // Invalidate old asynchronous work before navigation commits its params.
      conversation.beginSwitch();
      Keyboard.dismiss();
      action();
    };
    const warning = !conversation.conversationId && conversation.messages.length > 0
      ? "chat_leave_unsaved"
      : turn.failed ? "chat_leave_pending"
      : composer.input.trim() ? "chat_leave_draft" : null;
    if (!warning) { proceed(); return; }
    Alert.alert(t("chat_leave_title"), t(warning), [
      { text: t("confirm_cancel"), style: "cancel" },
      { text: t("chat_leave_confirm"), style: "destructive", onPress: proceed },
    ]);
  }

  function startNewChat() {
    changeConversation(() => {
      router.setParams({
        ideaId: undefined,
        ideaText: undefined,
        conversationId: undefined,
        // A new value also resets a chat whose URL already has no conversation.
        chatSession: createClientMessageId(),
      });
    });
  }

  async function handleSend() {
    const text = composer.input.trim();
    if (!text || composerBusy || conversation.switchingRef.current || turn.inFlight()) return;
    tapLight();
    composer.setInput("");
    await turn.send(text, conversation.model);
  }

  function handleMic() {
    composer.toggleMic(composerBusy || conversation.switchingRef.current);
  }

  // Retry and the Diario switch need a failed turn and nothing else in flight.
  function canResume() {
    return turn.failed !== null && !busy && !conversation.switchingRef.current && !turn.inFlight();
  }

  function retryStream() {
    if (canResume()) void turn.retry();
  }

  function continueWithDaily() {
    if (canResume()) void turn.continueWithDaily();
  }

  function handleErrorAction(action: ChatErrorAction) {
    if (action === "use_daily") continueWithDaily();
    else startNewChat();
  }

  const chatFailed = turn.failed;

  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      {/* Saludo y perfil; las dos acciones del chat tienen su propia fila. */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerEyebrow}>{t("header_asistente_eyebrow")}</Text>
          <Text style={styles.headerGreet}>{t("chat_greet")}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.avatar}
            onPress={() => setProfileOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("chat_profile_open")}
          >
            {userPhotoUrl ? (
              <Image source={{ uri: userPhotoUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{userInitials}</Text>
            )}
          </Pressable>
        </View>
      </View>
      <View style={styles.chatActions}>
        <Pressable
          style={({ pressed }) => [styles.historyPill, styles.newChatPill, (pressed || navigationBusy) && styles.actionDimmed]}
          onPress={startNewChat}
          disabled={navigationBusy}
          accessibilityRole="button"
          accessibilityLabel={t("chat_new")}
          accessibilityState={{ disabled: navigationBusy }}
        >
          <Ionicons name="add-outline" size={18} color={colors.paper} />
          <Text style={[styles.historyLabel, styles.newChatLabel]}>{t("chat_new")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.historyPill, (pressed || navigationBusy) && styles.actionDimmed]}
          onPress={() => setHistoryOpen(true)}
          disabled={navigationBusy}
          accessibilityRole="button"
          accessibilityLabel={t("chat_history")}
          accessibilityState={{ disabled: navigationBusy }}
        >
          <Ionicons name="time-outline" size={18} color={colors.ink} />
          <Text style={styles.historyLabel}>{t("chat_history")}</Text>
        </Pressable>
      </View>
      <View style={styles.divider} />

      <PreviousChatsSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onPick={(conv) => {
          if (conv.id === conversation.conversationId) return;
          changeConversation(() => router.setParams({
            ideaId: undefined,
            ideaText: conv.ideaText ?? undefined,
            conversationId: conv.id,
            chatSession: createClientMessageId(),
          }));
        }}
      />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      {rememberText !== null && canRemember ? (
        <RememberNoteSheet text={rememberText} onClose={() => setRememberText(null)} />
      ) : null}

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

        {puedeCreativo ? <ModelSwitch model={conversation.model} onChange={conversation.setModel} /> : null}

        <View style={{ flex: 1 }}>
          {conversation.loading ? (
            <ActivityIndicator style={{ flex: 1 }} color={colors.terracota} />
          ) : conversation.loadError ? (
            <NetworkError sub={t("error_offline_generic_sub")} onRetry={conversation.retryLoad} />
          ) : conversation.messages.length === 0 && !busy ? (
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
                streamingVisible ? (
                  <StreamingBubble
                    stream={turn.stream}
                    eyebrowLabel={assistantEyebrow}
                    statusLabel={t("chat_answer_writing")}
                  />
                ) : null
              }
              ListFooterComponent={
                conversation.messages.length > 0 ? (
                  <View style={styles.daySep}>
                    <Text style={styles.dayChip}>
                      {dayLabel(conversation.messages[0].createdAt, t, dateLocale(langPref))}
                    </Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>

        {chatFailed ? (
          <ChatFailureBanner
            failure={chatFailed.failure}
            model={chatFailed.turn.model}
            onAction={handleErrorAction}
            onRetry={retryStream}
          />
        ) : null}

        {showSaveButton ? (
          <View style={styles.saveStack}>
            <Pressable
              style={[styles.saveAction, save.structuring && { opacity: 0.6 }]}
              onPress={save.saveAsRecipe}
              disabled={save.structuring}
              accessibilityRole="button"
              accessibilityLabel={save.structuring ? t("chat_structuring") : t("chat_save_recipe")}
              accessibilityState={{ busy: save.structuring }}
            >
              {save.structuring ? (
                <ActivityIndicator size="small" color={colors.terracota} />
              ) : (
                <Ionicons name="bookmark-outline" size={14} color={colors.terracota} />
              )}
              <Text style={styles.saveActionLabel}>
                {save.structuring ? t("chat_structuring") : t("chat_save_recipe")}
              </Text>
            </Pressable>
            {!hasRestaurant ? (
              <Text style={styles.saveHint}>{t("chat_save_needs_restaurant")}</Text>
            ) : null}
          </View>
        ) : null}

        <Composer
          input={composer.input}
          onChangeText={composer.setInput}
          composerBusy={composerBusy}
          listening={composer.listening}
          busy={busy}
          stopping={turn.phase === "stopping"}
          onMic={handleMic}
          onSend={handleSend}
          onStop={() => void turn.stop(conversation.conversationId)}
        />
        {/* Empuja el composer por encima del teclado (Android edge-to-edge). */}
        <View style={{ height: kbPad }} />
      </View>
    </SafeAreaView>
  );
}
