// Composer of the assistant: dictation, text input, and send or stop (moved out of the screen in A12, Stop in A13).
import { Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SendButton } from "@/src/components/SendButton";
import { useI18n } from "@/src/hooks/useI18n";
import { speechAvailable } from "@/src/hooks/useSpeechInput";
import { colors } from "@/src/theme";
import { styles } from "../chat-styles";

type Props = {
  input: string;
  onChangeText: (text: string) => void;
  composerBusy: boolean;
  listening: boolean;
  // A turn is running: the Stop control replaces Send.
  busy: boolean;
  stopping: boolean;
  onMic: () => void;
  onSend: () => void;
  onStop: () => void;
};

export function Composer({ input, onChangeText, composerBusy, listening, busy, stopping, onMic, onSend, onStop }: Props) {
  const { t } = useI18n();
  return (
    <View style={styles.composer}>
      {/* Sin el módulo nativo (Expo Go) el mic se esconde; en el APK está. */}
      {speechAvailable ? (
        <Pressable
          onPress={onMic}
          disabled={composerBusy}
          style={[
            styles.micBtn,
            listening && styles.micBtnActive,
            composerBusy && styles.micBtnDisabled,
          ]}
          accessibilityRole="button"
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
        onChangeText={onChangeText}
        placeholder={t("chat_placeholder_voice")}
        placeholderTextColor={colors.mute}
        style={styles.composerInput}
        multiline
        editable={!composerBusy}
        accessibilityLabel={t("chat_input_label")}
      />
      {busy ? (
        <Pressable
          onPress={onStop}
          disabled={stopping}
          style={[styles.stopBtn, stopping && styles.stopBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t("chat_stop_answer")}
          accessibilityState={{ disabled: stopping }}
        >
          <Ionicons name="stop" size={16} color={colors.paper} />
        </Pressable>
      ) : (
        <SendButton
          disabled={!input.trim() || composerBusy || listening}
          streaming={false}
          onPress={onSend}
        />
      )}
    </View>
  );
}
