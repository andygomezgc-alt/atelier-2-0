// RecipeCostCard — tarjeta de costo en la cabecera del detalle de receta
// (sub-paso 6 del rediseño del Banco).
//
// Reglas que aplica:
//   - Si recipe.recipeIngredients.length === 0 → no se renderiza (recetas
//     legacy puras sin ingredientes estructurados no tienen costo).
//   - Costo por porción es la lectura principal (serif grande). Total y
//     food cost % en segunda línea pequeña.
//   - Food cost % solo si hay salePrice cargado.
//   - portions=null → asume 1 al calcular (el backend ya lo hace), pero
//     mostramos "Sin porciones definidas" como hint sutil.
//   - Si missingPriceCount + unmeasuredCount + unlinkedCount > 0 → aviso
//     "N ingredientes sin costo" con tap → /productos?filter=sin-precio.
//   - Inputs de portions / salePrice editables tap-to-edit (Modal con
//     TextInput numérico). PATCH al recipe → revalidar.

import { memo, useCallback, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { RecipeDetail } from "@atelier/shared";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  recipe: RecipeDetail;
  canEdit: boolean;
  onPatchPortions: (portions: number | null) => Promise<void>;
  onPatchSalePrice: (salePriceCents: number | null) => Promise<void>;
};

// Formato monetario simple en euros (sub-paso 6: hardcoded EUR; selector
// por restaurante queda para Entrega B).
function formatEuro(cents: number | null): string {
  if (cents === null) return "—";
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function RecipeCostCardImpl({
  recipe,
  canEdit,
  onPatchPortions,
  onPatchSalePrice,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState<"portions" | "salePrice" | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  if (recipe.recipeIngredients.length === 0) return null;

  const c = recipe.cost;
  const portions = recipe.portions ?? 1;
  const portionsRaw = recipe.portions; // null si no se setteó
  const missingTotal =
    c.missingPriceCount + c.unmeasuredCount + c.unlinkedCount;

  // Subtitulo de desglose: solo se muestra si hay >1 tipo de "missing".
  let breakdown: string | null = null;
  const parts: string[] = [];
  if (c.missingPriceCount > 0) {
    parts.push(t("cost_breakdown_no_price", { n: c.missingPriceCount }));
  }
  if (c.unmeasuredCount > 0) {
    parts.push(t("cost_breakdown_no_qty", { n: c.unmeasuredCount }));
  }
  if (c.unlinkedCount > 0) {
    parts.push(t("cost_breakdown_unlinked", { n: c.unlinkedCount }));
  }
  if (parts.length > 1) breakdown = parts.join(" · ");

  const openEdit = useCallback((field: "portions" | "salePrice") => {
    setEditing(field);
    if (field === "portions") {
      setEditValue(portionsRaw !== null ? String(portionsRaw) : "");
    } else {
      setEditValue(
        recipe.salePrice !== null
          ? (recipe.salePrice / 100).toFixed(2).replace(".", ",")
          : "",
      );
    }
  }, [portionsRaw, recipe.salePrice]);

  const closeEdit = useCallback(() => {
    if (saving) return;
    setEditing(null);
    setEditValue("");
  }, [saving]);

  const commitEdit = useCallback(async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      const trimmed = editValue.trim();
      if (editing === "portions") {
        if (trimmed === "") {
          await onPatchPortions(null);
        } else {
          const n = parseInt(trimmed, 10);
          if (!isNaN(n) && n > 0) await onPatchPortions(n);
        }
      } else {
        if (trimmed === "") {
          await onPatchSalePrice(null);
        } else {
          const f = parseFloat(trimmed.replace(",", "."));
          if (!isNaN(f) && f >= 0) await onPatchSalePrice(Math.round(f * 100));
        }
      }
      setEditing(null);
      setEditValue("");
    } finally {
      setSaving(false);
    }
  }, [editing, editValue, onPatchPortions, onPatchSalePrice, saving]);

  const onWarningPress = useCallback(() => {
    router.push("/productos?filter=sin-precio" as never);
  }, [router]);

  return (
    <View style={styles.card}>
      {/* Hero: costo por porción */}
      <View style={styles.heroRow}>
        <Text style={styles.eyebrow}>{t("cost_card_per_portion")}</Text>
      </View>
      <Text style={styles.bigCost}>{formatEuro(c.perPortionCents)}</Text>

      {/* Línea secundaria: total + food cost */}
      <View style={styles.secondaryRow}>
        <Text style={styles.secondaryText}>
          {t("cost_card_total")}: {formatEuro(c.totalCents)}
        </Text>
        {c.foodCostPct !== null ? (
          <Text style={styles.secondaryText}>
            {"  ·  "}
            {t("cost_card_food_cost", { n: c.foodCostPct })}
          </Text>
        ) : null}
      </View>

      {/* Editor: porciones + precio venta */}
      <View style={styles.editRow}>
        <Pressable
          style={styles.editPill}
          disabled={!canEdit}
          onPress={() => openEdit("portions")}
        >
          <Ionicons name="people-outline" size={13} color={colors.inkSoft} />
          <Text style={styles.editPillText}>
            {portionsRaw === null
              ? t("cost_card_no_portions")
              : t("cost_card_portions_n", { n: portions })}
          </Text>
          {canEdit ? (
            <Ionicons name="create-outline" size={12} color={colors.mute} />
          ) : null}
        </Pressable>
        <Pressable
          style={styles.editPill}
          disabled={!canEdit}
          onPress={() => openEdit("salePrice")}
        >
          <Ionicons name="pricetag-outline" size={13} color={colors.inkSoft} />
          <Text style={styles.editPillText}>
            {recipe.salePrice === null
              ? t("cost_card_no_sale_price")
              : t("cost_card_sale_price", {
                  value: formatEuro(recipe.salePrice),
                })}
          </Text>
          {canEdit ? (
            <Ionicons name="create-outline" size={12} color={colors.mute} />
          ) : null}
        </Pressable>
      </View>

      {/* Warning de costos incompletos */}
      {missingTotal > 0 ? (
        <Pressable style={styles.warning} onPress={onWarningPress}>
          <Ionicons name="warning-outline" size={14} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>
              {t("cost_card_missing_n", { n: missingTotal })}
            </Text>
            {breakdown ? (
              <Text style={styles.warningSub}>{breakdown}</Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.danger} />
        </Pressable>
      ) : null}

      {/* Entrega A.5 — aviso de rango ancho de pezzatura: el costo es una
          aproximación porque el banco tiene un rango max/min > 2x. No
          bloquea ni es error; tono suave gris para no asustar. */}
      {c.wideRangeCount > 0 ? (
        <View style={styles.softNote}>
          <Ionicons name="information-circle-outline" size={14} color={colors.mute} />
          <Text style={styles.softNoteText}>
            {t("cost_card_wide_range_n", { n: c.wideRangeCount })}
          </Text>
        </View>
      ) : null}

      {/* Modal de edición — usado para porciones y precio venta */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="fade"
        onRequestClose={closeEdit}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeEdit}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {editing === "portions"
                ? t("cost_card_edit_portions_title")
                : t("cost_card_edit_sale_price_title")}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={editValue}
              onChangeText={setEditValue}
              keyboardType={
                editing === "portions"
                  ? "number-pad"
                  : Platform.select({ ios: "decimal-pad", default: "numeric" })
              }
              autoFocus
              placeholder={
                editing === "portions"
                  ? t("cost_card_edit_portions_placeholder")
                  : t("cost_card_edit_sale_price_placeholder")
              }
              placeholderTextColor={colors.mute}
              onSubmitEditing={commitEdit}
              returnKeyType="done"
            />
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={closeEdit}
                disabled={saving}
              >
                <Text style={styles.modalButtonCancelText}>
                  {t("confirm_cancel")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={commitEdit}
                disabled={saving}
              >
                <Text style={styles.modalButtonConfirmText}>
                  {saving ? "…" : t("confirm_ok")}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export const RecipeCostCard = memo(RecipeCostCardImpl);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paperSoft,
    borderRadius: radii.lg,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroRow: { flexDirection: "row", alignItems: "center" },
  eyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "600",
  },
  bigCost: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifXl,
    color: colors.ink,
    lineHeight: fontSizes.serifXl * 1.1,
  },
  secondaryRow: { flexDirection: "row", marginTop: 2 },
  secondaryText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
  },
  editRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  editPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.paperWarm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderWidth: 0.5,
    borderColor: colors.edgeSoft,
  },
  editPillText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.inkSoft,
  },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.edgeSoft,
  },
  warningTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.danger,
    fontWeight: "600",
  },
  warningSub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: 1,
  },
  softNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.edgeSoft,
  },
  softNoteText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    fontStyle: "italic",
    lineHeight: fontSizes.caption * 1.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalSheet: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifMd,
    color: colors.ink,
  },
  modalInput: {
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  modalButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  modalButtonCancel: { backgroundColor: "transparent" },
  modalButtonCancelText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.mute,
  },
  modalButtonConfirm: { backgroundColor: colors.terracota },
  modalButtonConfirmText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.paper,
    fontWeight: "600",
  },
});
