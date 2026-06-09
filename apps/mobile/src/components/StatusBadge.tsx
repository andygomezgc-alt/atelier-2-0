// Bloque 4 · C-04 — Vocabulario único de estados.
// 4 niveles fijos con color + ícono no negociables. Cualquier "aviso",
// "chip de criticidad", "banner de error" o "toast" del proyecto debería
// pasar por acá; las decisiones de color/ícono viven SOLO en este archivo.
//
// Mapping (decisión cerrada por Andy):
//   error   → colors.danger    + alert-circle
//   warning → colors.terracota + warning
//   ok      → colors.teal      + checkmark-circle
//   info    → colors.mute      + information-circle

import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export type StatusLevel = "error" | "warning" | "ok" | "info";

export const STATUS_MAP: Record<
  StatusLevel,
  { color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  error: { color: colors.danger, icon: "alert-circle" },
  warning: { color: colors.terracota, icon: "warning" },
  ok: { color: colors.teal, icon: "checkmark-circle" },
  info: { color: colors.mute, icon: "information-circle" },
};

type Props = {
  level: StatusLevel;
  label: string;
};

export function StatusBadge({ level, label }: Props) {
  const cfg = STATUS_MAP[level];
  return (
    <View style={[styles.root, { borderColor: cfg.color }]}>
      <Ionicons name={cfg.icon} size={14} color={cfg.color} />
      <Text style={[styles.label, { color: cfg.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    alignSelf: "flex-start",
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
});
