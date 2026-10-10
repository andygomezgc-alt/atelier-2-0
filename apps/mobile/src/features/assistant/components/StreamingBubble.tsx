// The answer being written (A12). The only component that re-renders per streamed chunk:
// it subscribes to the stream store, so the screen never sees the text.
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
  // Interrupted or resuming (A13b): the status is shown in place of the writing dots until the text starts.
  recovering?: boolean;
};

export function StreamingBubble({ stream, eyebrowLabel, statusLabel, recovering = false }: Props) {
  const shown = useSyncExternalStore(stream.subscribe, stream.getSnapshot);
  const visibleStatus = recovering && !shown;
  return (
    <View style={styles.assistantWrap}>
      <Text style={styles.assistantEyebrow}>{eyebrowLabel}</Text>
      <View style={styles.assistantRule} />
      <View accessibilityLiveRegion="polite" style={visibleStatus ? styles.recoveringStatus : styles.srOnly}>
        <Text style={visibleStatus ? styles.recoveringText : undefined}>{statusLabel}</Text>
      </View>
      {shown ? (
        <View style={styles.assistantBody}>
          <MarkdownText text={stripRecipePayload(shown)} />
        </View>
      ) : visibleStatus ? null : (
        <TypingDots />
      )}
    </View>
  );
}
