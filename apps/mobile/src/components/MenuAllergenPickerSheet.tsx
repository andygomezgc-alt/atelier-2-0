// Panel "Añadir alérgeno" del botón "+" de un plato en la preview del menú.
//
// Distinto del antiguo ProductAllergenSheet (que fue revertido). Acá:
//   - Vista por default: 8 alérgenos comunes (gluten, milk, eggs, fish,
//     tree_nuts, soy, crustaceans, sulphites). Toggle "Ver los 14" expande.
//   - Heredados (vienen de un product enlazado) salen con check + opacity 0.5
//     + disabled. Para quitarlos hay que editar el producto del banco.
//   - Manuales ya presentes salen con check pero habilitados — tap = remove.
//   - Ausentes (no heredados ni manuales) habilitados — tap = add + cierra.
//   - Sin botón confirmar. Sin granularidad de "ocultar del PDF" (decisión Andy).

import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ALLERGEN_ORDER, type Allergen } from "@atelier/shared";
import { useI18n } from "@/src/hooks/useI18n";
import { BottomSheet } from "./BottomSheet";
import { AllergenIcon } from "./AllergenIcon";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

// 8 comunes (orden propuesto Andy — la imagen 2 los lista así).
const COMMON_ALLERGENS: readonly Allergen[] = [
  "crustaceans",
  "fish",
  "milk",
  "gluten",
  "eggs",
  "molluscs",
  "soy",
  "tree_nuts",
] as const;

type Props = {
  open: boolean;
  recipeName: string;
  allergens: Allergen[];        // unión heredados + manuales
  manualAllergens: Allergen[];  // subset que es manual
  onAdd: (allergen: Allergen) => void;
  onRemove: (allergen: Allergen) => void;
  onClose: () => void;
};

export function MenuAllergenPickerSheet({
  open,
  recipeName,
  allergens,
  manualAllergens,
  onAdd,
  onRemove,
  onClose,
}: Props) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);

  const visibleSet: readonly Allergen[] = showAll ? ALLERGEN_ORDER : COMMON_ALLERGENS;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("menu_add_allergen_title")}</Text>
        {recipeName ? (
          <Text style={styles.subtitle} numberOfLines={2}>{recipeName}</Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {visibleSet.map((a) => {
            const isPresent = allergens.includes(a);
            const isManual = manualAllergens.includes(a);
            const isInherited = isPresent && !isManual;

            if (isInherited) {
              // Disabled chip — heredado, no se puede tocar desde el plato.
              return (
                <View key={a} style={[styles.chip, styles.chipInherited]}>
                  <AllergenIcon allergen={a} size={16} color={colors.inkSoft} />
                  <Text style={[styles.chipLabel, styles.chipLabelMute]} numberOfLines={1}>
                    {t(`allergen_${a}` as const)}
                  </Text>
                  <Ionicons name="checkmark" size={14} color={colors.inkSoft} />
                </View>
              );
            }
            if (isManual) {
              // Tap = remove manual.
              return (
                <Pressable
                  key={a}
                  style={[styles.chip, styles.chipManual]}
                  onPress={() => onRemove(a)}
                >
                  <AllergenIcon allergen={a} size={16} color={colors.ink} />
                  <Text style={[styles.chipLabel]} numberOfLines={1}>
                    {t(`allergen_${a}` as const)}
                  </Text>
                  <Ionicons name="checkmark" size={14} color={colors.ink} />
                </Pressable>
              );
            }
            // Ausente — tap = add + cierra.
            return (
              <Pressable
                key={a}
                style={styles.chip}
                onPress={() => {
                  onAdd(a);
                  onClose();
                }}
              >
                <AllergenIcon allergen={a} size={16} color={colors.ink} />
                <Text style={[styles.chipLabel]} numberOfLines={1}>
                  {t(`allergen_${a}` as const)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={styles.toggleAll}
          onPress={() => setShowAll((s) => !s)}
        >
          <Ionicons
            name={showAll ? "chevron-up" : "chevron-down"}
            size={14}
            color={colors.mute}
          />
          <Text style={styles.toggleAllLabel}>
            {showAll ? t("menu_add_allergen_see_common") : t("menu_add_allergen_see_all")}
          </Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    alignItems: "center",
  },
  title: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    fontWeight: "600",
  },
  subtitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    textAlign: "center",
    marginTop: 2,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paper,
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 130,
  },
  chipInherited: {
    backgroundColor: colors.paperSoft,
    opacity: 0.5,
  },
  chipManual: {
    backgroundColor: colors.paperSoft,
  },
  chipLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.ink,
    flex: 1,
  },
  chipLabelMute: { color: colors.inkSoft },
  toggleAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: "transparent",
  },
  toggleAllLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
  },
});
