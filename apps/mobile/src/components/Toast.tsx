// Global toast: any component can fire `showToast(msg)` without piping
// callbacks through props. The host renders <ToastHost /> once, near
// the root, and listens to the same store.
//
// Bloque 4 · C-04 — `level` opcional (default "ok") mapea al vocabulario
// único de StatusBadge (color + ícono fijos por nivel).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import { STATUS_MAP, type StatusLevel } from "./StatusBadge";

type ToastEntry = { id: number; message: string; level: StatusLevel };

let current: ToastEntry | null = null;
const listeners = new Set<() => void>();
let nextId = 1;

export function showToast(message: string, level: StatusLevel = "ok") {
  current = { id: nextId++, message, level };
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

  const cfg = STATUS_MAP[value.level];

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.root,
        { backgroundColor: cfg.color },
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Ionicons name={cfg.icon} size={16} color={colors.paper} />
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
