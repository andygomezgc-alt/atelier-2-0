// Composer of the assistant: dictation, text input and send (moved out of the screen in A12).
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
  streaming: boolean;
  onMic: () => void;
  onSend: () => void;
};

export function Composer({ input, onChangeText, composerBusy, listening, streaming, onMic, onSend }: Props) {
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
      <SendButton
        disabled={!input.trim() || composerBusy || listening}
        streaming={streaming}
        onPress={onSend}
      />
    </View>
  );
}
