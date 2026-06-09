// Sheet modal con lista cerrada de opciones — reusable.
//
// Caso de uso (sub-paso 2b del Banco): el chef toca "Categoría" o "Unidad"
// dentro de "Más opciones" del detalle de producto; se abre este sheet con
// la lista completa de opciones; tap una → onSelect + cierre + save.
//
// Diseño: Modal centrado (mismo patrón que ConfirmSheet, no bottom-sheet
// para mantener consistencia con el resto de modales del proyecto). Si
// crecen las opciones >15 conviene migrar a slideUp; con 11 categorías
// + 6 unidades el modal centrado da buena UX.
//
// La opción actual se marca con check de terracota. Tap fuera del modal
// (backdrop) cancela.

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  open: boolean;
  title: string;
  options: ReadonlyArray<ChoiceOption<T>>;
  current: T;
  onSelect: (value: T) => void;
  onCancel: () => void;
};

export function ChoiceSheet<T extends string>({
  open,
  title,
  options,
  current,
  onSelect,
  onCancel,
}: Props<T>) {
  return (
    <Modal visible={open} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {options.map((opt) => {
              const selected = opt.value === current;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => onSelect(opt.value)}
                  style={[styles.row, selected && styles.rowSelected]}
                >
                  <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                    {opt.label}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark" size={16} color={colors.terracota} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,17,15,0.5)" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  dialog: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "70%",
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
  },
  rowSelected: { backgroundColor: colors.paperSoft },
  rowLabel: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft },
  rowLabelSelected: { color: colors.terracota, fontWeight: "600" },
});
