// Diario / Creativo switch above the chat (moved out of the screen in A12).
import type { TranslationKey } from "@atelier/i18n";
import type { ChatMode } from "@atelier/shared";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { styles } from "../chat-styles";

const MODEL_LABEL_KEYS: Record<ChatMode, TranslationKey> = {
  daily: "model_daily",
  creative: "model_creative",
};

export function ModelSwitch({ model, onChange }: { model: ChatMode; onChange: (model: ChatMode) => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.modelRow}>
      {(["daily", "creative"] as const).map((m) => (
        <Pressable
          key={m}
          style={[styles.modelChip, model === m && styles.modelChipActive]}
          onPress={() => onChange(m)}
          accessibilityRole="button"
          accessibilityLabel={t(MODEL_LABEL_KEYS[m])}
          accessibilityState={{ selected: model === m }}
        >
          <Text style={[styles.modelLabel, model === m && styles.modelLabelActive]}>
            {t(MODEL_LABEL_KEYS[m])}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
