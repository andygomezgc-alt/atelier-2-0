// A saved message of the assistant chat (A-03, moved out of the screen in A12).
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, withSpring, withTiming } from "react-native-reanimated";
import type { EntryExitAnimationFunction } from "react-native-reanimated";
import { MarkdownText } from "@/src/components/MarkdownText";
import type { ChatMessage } from "@/src/api/conversations";
import { stripRecipePayload } from "@/src/lib/recipe-payload";
import { styles } from "../chat-styles";

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

// `animate` is only true for messages that arrive live; the history loads still.
// `onRemember` arrives stable (useCallback); without it (no permission, or the preview) there is no long press.
export const MessageBubble = memo(function MessageBubble({
  m,
  eyebrowLabel,
  animate,
  onRemember,
  rememberLabel,
}: {
  m: ChatMessage;
  eyebrowLabel: string;
  animate: boolean;
  onRemember?: (m: ChatMessage) => void;
  rememberLabel: string;
}) {
  const wrapStyle = m.role === "user" ? styles.userWrap : styles.assistantWrap;
  const inner =
    m.role === "user" ? (
      <>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{m.content}</Text>
        </View>
        <Text style={styles.userTime}>{formatTime(m.createdAt)}</Text>
      </>
    ) : (
      <>
        <Text style={styles.assistantEyebrow}>{eyebrowLabel}</Text>
        <View style={styles.assistantRule} />
        <View style={styles.assistantBody}>
          <MarkdownText text={stripRecipePayload(m.content).trim()} />
        </View>
      </>
    );
  if (onRemember) {
    // "Recordar esto": pulsación larga (y acción de accesibilidad equivalente).
    const pressable = (
      <Pressable
        style={wrapStyle}
        onLongPress={() => onRemember(m)}
        accessibilityActions={[{ name: "longpress", label: rememberLabel }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "longpress") onRemember(m);
        }}
      >
        {inner}
      </Pressable>
    );
    return animate ? (
      <Animated.View entering={messageEntering}>{pressable}</Animated.View>
    ) : (
      pressable
    );
  }
  return animate ? (
    <Animated.View entering={messageEntering} style={wrapStyle}>
      {inner}
    </Animated.View>
  ) : (
    <View style={wrapStyle}>{inner}</View>
  );
});
