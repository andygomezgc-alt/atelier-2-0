// Honest error banner of the assistant (A3, moved out of the screen in A12).
// The failure is stored raw and classified here, at render, so the text follows the language.
import type { TranslationKey } from "@atelier/i18n";
import type { ChatMode } from "@atelier/shared";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/hooks/useI18n";
import { colors } from "@/src/theme";
import { classifyChatError, type ChatErrorAction, type ChatFailure } from "@/src/lib/chat-error";
import type { ChatTurnFailure } from "../chat-turn-reducer";
import { styles } from "../chat-styles";

const ERROR_ACTION_KEYS: Record<ChatErrorAction, TranslationKey> = {
  use_daily: "chat_use_daily",
  new_chat: "chat_new",
};

type Props = {
  failure: ChatTurnFailure;
  model: ChatMode;
  onAction: (action: ChatErrorAction) => void;
  onRetry: () => void;
};

export function ChatFailureBanner({ failure, model, onAction, onRetry }: Props) {
  const { t } = useI18n();
  // error === null: the chat was opened with its last question unanswered. A note, not a failure.
  const unanswered = failure.error === null;
  const view: ChatFailure = unanswered
    ? { message: t("chat_unanswered"), retryable: true, action: undefined }
    : classifyChatError(failure.error, t, model);

  return (
    <View style={styles.errorBanner}>
      <View style={styles.errorRow}>
        <Ionicons
          name={unanswered ? "information-circle" : "alert-circle"}
          size={16}
          color={unanswered ? colors.mute : colors.danger}
        />
        <Text style={styles.errorText}>{view.message}</Text>
      </View>
      {view.action || view.retryable ? (
        <View style={styles.errorActions}>
          {view.action ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(ERROR_ACTION_KEYS[view.action])}
              style={styles.errorAction}
              onPress={() => onAction(view.action!)}
            >
              <Text style={styles.errorActionLabel}>{t(ERROR_ACTION_KEYS[view.action])}</Text>
            </Pressable>
          ) : null}
          {view.retryable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("error_retry")}
              style={styles.errorAction}
              onPress={onRetry}
            >
              <Text style={styles.errorActionLabel}>{t("error_retry")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
