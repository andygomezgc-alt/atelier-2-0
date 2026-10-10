// The answer being written (A12). The only component that re-renders per streamed chunk:
// it subscribes to the stream store, so the screen never re-renders for the text.
import { useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { MarkdownText } from "@/src/components/MarkdownText";
import { TypingDots } from "@/src/components/TypingDots";
import { stripRecipePayload } from "@/src/lib/recipe-payload";
import type { StreamText } from "../stream-text-store";
import { styles } from "../chat-styles";

type Props = {
  stream: StreamText;
  eyebrowLabel: string;
  // Announced once, politely; the live region never carries the streamed text.
  statusLabel: string;
};

export function StreamingBubble({ stream, eyebrowLabel, statusLabel }: Props) {
  const shown = useSyncExternalStore(stream.subscribe, stream.getSnapshot);
  return (
    <View style={styles.assistantWrap}>
      <Text style={styles.assistantEyebrow}>{eyebrowLabel}</Text>
      <View style={styles.assistantRule} />
      <View accessibilityLiveRegion="polite" style={styles.srOnly}>
        <Text>{statusLabel}</Text>
      </View>
      {shown ? (
        <View style={styles.assistantBody}>
          <MarkdownText text={stripRecipePayload(shown)} />
        </View>
      ) : (
        <TypingDots />
      )}
    </View>
  );
}
