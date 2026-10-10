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
  // Interrupted or resuming (A13b/A13c): only the visible status shows; any partial text of the cut is discarded.
  recovering?: boolean;
};

export function StreamingBubble({ stream, eyebrowLabel, statusLabel, recovering = false }: Props) {
  const shown = useSyncExternalStore(stream.subscribe, stream.getSnapshot);
  return (
    <View style={styles.assistantWrap}>
      <Text style={styles.assistantEyebrow}>{eyebrowLabel}</Text>
      <View style={styles.assistantRule} />
      <View accessibilityLiveRegion="polite" style={recovering ? styles.recoveringStatus : styles.srOnly}>
        <Text style={recovering ? styles.recoveringText : undefined}>{statusLabel}</Text>
      </View>
      {recovering ? null : shown ? (
        <View style={styles.assistantBody}>
          <MarkdownText text={stripRecipePayload(shown)} />
        </View>
      ) : (
        <TypingDots />
      )}
    </View>
  );
}
