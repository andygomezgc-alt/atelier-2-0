// Ingredients section of the recipe detail.
//
// With cost lines (recipe detail of an API that sends them) each ingredient
// shows its cost, or the reason it has none in the cost card's warning colour
// and a chevron when this user can fix it. Without lines it renders the plain
// legacy list from contentJson.
//
// Standard format: ingredients are grouped by section (one heading per run of
// the same section, none for rows without one), and each line shows its note
// and, for pieces, the weight per piece in muted text. The legacy list already
// has the note inside each display line, so it stays as it is.

import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatQuantity, type RecipeCostLine, type RecipeIngredientResponse } from "@atelier/shared";
import { Eyebrow } from "@/src/components/Eyebrow";
import { useI18n } from "@/src/hooks/useI18n";
import { groupBySection } from "@/src/lib/group-by-section";
import { formatEuros } from "@/src/lib/money";
import {
  isLinePressable,
  joinCostLines,
  lineReason,
  unitLabelKey,
  type IngredientCostRow,
  type LinePermissions,
} from "@/src/lib/ingredient-cost";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export type IngredientRow = IngredientCostRow<RecipeIngredientResponse>;

type Props = {
  ingredients: readonly string[];
  recipeIngredients: readonly RecipeIngredientResponse[];
  lines?: readonly RecipeCostLine[];
  permissions: LinePermissions;
  onLinePress: (row: IngredientRow) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function RecipeIngredientList({
  ingredients,
  recipeIngredients,
  lines,
  permissions,
  onLinePress,
  onLayout,
}: Props) {
  const { t } = useI18n();
  const rows = joinCostLines(lines, recipeIngredients, ingredients);

  if (!rows) {
    if (ingredients.length === 0) return null;
    return (
      <View style={styles.section} onLayout={onLayout}>
        <Eyebrow>{t("section_ingredients")}</Eyebrow>
        {ingredients.map((it, idx) => (
          <Text key={idx} style={styles.bullet}>
            · {it}
          </Text>
        ))}
      </View>
    );
  }

  const unitName = (unit: string) => {
    const key = unitLabelKey(unit);
    return key ? t(key) : unit;
  };

  return (
    <View style={styles.section} onLayout={onLayout}>
      <Eyebrow>{t("section_ingredients")}</Eyebrow>
      {groupBySection(rows, (row) => row.ingredient?.section).map((group, groupIdx) => (
        <View key={groupIdx} style={styles.group}>
          {group.section ? (
            <Eyebrow variant="terracota" style={styles.sectionHeading}>
              {group.section}
            </Eyebrow>
          ) : null}
          {group.rows.map((row) => {
            const { line, ingredient } = row;
            const reason = lineReason(line, unitName);
            const pressable = isLinePressable(line.status, permissions, line.productId);
            const isPiece = ingredient?.unit === "unidad" || ingredient?.unit === "piezas";
            const pieceWeight = isPiece && ingredient?.pesoCalculoG ? ingredient.pesoCalculoG : null;
            const body = (
              <>
                <View style={styles.rowText}>
                  <Text style={styles.bullet}>· {row.text}</Text>
                  {ingredient?.note ? <Text style={styles.detail}>{ingredient.note}</Text> : null}
                  {pieceWeight ? (
                    <Text style={styles.detail}>
                      {t("recipe_ingredient_piece_weight", { g: formatQuantity(pieceWeight) })}
                    </Text>
                  ) : null}
                  {reason ? <Text style={styles.reason}>{t(reason.key, reason.vars)}</Text> : null}
                </View>
                {line.status === "ok" && line.costCents !== null ? (
                  <Text style={styles.cost}>{formatEuros(line.costCents)}</Text>
                ) : null}
                {pressable ? <Ionicons name="chevron-forward" size={14} color={colors.danger} /> : null}
              </>
            );
            const key = `${line.ingredientId}-${line.position}`;
            return pressable ? (
              <Pressable
                key={key}
                style={styles.row}
                onPress={() => onLinePress(row)}
                accessibilityRole="button"
              >
                {body}
              </Pressable>
            ) : (
              <View key={key} style={styles.row}>
                {body}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
    gap: spacing.xs,
  },
  bullet: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    lineHeight: fontSizes.serifBody * 1.5,
  },
  group: { gap: spacing.xs },
  sectionHeading: { marginTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowText: { flex: 1 },
  reason: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.danger,
    marginTop: -2,
    marginBottom: 2,
  },
  detail: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: -2,
  },
  cost: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
});
