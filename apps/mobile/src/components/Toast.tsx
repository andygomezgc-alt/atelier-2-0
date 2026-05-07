// Global toast: any component can fire `showToast(msg)` without piping
// callbacks through props. The host renders <ToastHost /> once, near
// the root, and listens to the same store.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

let current: { id: number; message: string } | null = null;
const listeners = new Set<() => void>();
let nextId = 1;

export function showToast(message: string) {
  current = { id: nextId++, message };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return current;
}

export function ToastHost() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!value) return;
    setVisible(true);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 200, useNativeDriver: true }),
      ]).start(() => setVisible(false));
    }, 2200);

    return () => clearTimeout(t);
  }, [value, opacity, translateY]);

  if (!visible || !value) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { opacity, transform: [{ translateY }] }]}
    >
      <Ionicons name="checkmark" size={16} color={colors.paper} />
      <Text style={styles.text}>{value.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    bottom: 90,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.teal,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { color: colors.paper, fontFamily: fonts.sans, fontSize: fontSizes.bodySm },
});
