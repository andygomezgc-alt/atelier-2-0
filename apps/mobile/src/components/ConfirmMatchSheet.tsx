// Sheet de confirmación para matches probables del Banco de Productos.
//
// Caso de uso: el chef tipeó "trufas" en una receta y el banco ya tiene un
// producto "Trufa negra". Levenshtein devuelve distancia 1-3 → probable.
// Antes de auto-enlazar mostramos esto:
//
//   ┌──────────────────────────────────────┐
//   │ ¿Es "trufas" lo mismo que            │
//   │ Trufa negra?                         │
//   │                                      │
//   │  [Crear nuevo]  [Sí, es el mismo]   │
//   └──────────────────────────────────────┘
//
// "Sí" → enlazar productId + agregar "trufas" como alias del producto.
// "Crear nuevo" → no enlazar; el form crea un draft con name="trufas".

import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  rawText: string;          // lo que tipeó el chef
  candidateName: string;    // el producto que el banco propone
  // Title/labels desde i18n del parent para mantener locale-correctness.
  title: string;
  body: string;
  yesLabel: string;
  noLabel: string;
  onYes: () => void;  // enlazar + agregar alias
  onNo: () => void;   // crear nuevo producto
};

export function ConfirmMatchSheet({
  open,
  rawText,
  candidateName,
  title,
  body,
  yesLabel,
  noLabel,
  onYes,
  onNo,
}: Props) {
  return (
    <Modal visible={open} animationType="fade" transparent onRequestClose={onNo}>
      <Pressable style={styles.backdrop} onPress={onNo} />
      <View style={styles.center}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.comparison}>
            <Text style={styles.label}>"{rawText}"</Text>
            <Text style={styles.arrow}>≟</Text>
            <Text style={[styles.label, styles.candidate]}>{candidateName}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.btnGhost} onPress={onNo}>
              <Text style={styles.btnGhostLabel}>{noLabel}</Text>
            </Pressable>
            <Pressable style={styles.btnSolid} onPress={onYes}>
              <Text style={styles.btnSolidLabel}>{yesLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,17,15,0.5)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  dialog: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
    lineHeight: fontSizes.bodySm * 1.5,
  },
  comparison: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    flexShrink: 1,
  },
  candidate: { color: colors.terracota, fontWeight: "600" },
  arrow: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifLg,
    color: colors.mute,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btnGhost: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  btnGhostLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
    fontWeight: "600",
  },
  btnSolid: {
    flex: 1,
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  btnSolidLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.paper,
    fontWeight: "600",
  },
});
