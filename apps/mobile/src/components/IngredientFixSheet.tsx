// Fix sheet for an ingredient without cost (costes por ingrediente, A2).
//
// Opened from the recipe detail for no_price, needs_density,
// needs_piece_weight and incompatible_unit. It edits the linked product: the
// purchase unit, the price per that unit, and — only when the unit pair needs
// it — the weight of 1 litre or of 1 piece. Save PATCHes only the changed
// fields; the parent then reloads the recipe so its cost is recomputed.
// BottomSheet compensates the keyboard (Android edge-to-edge).

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ProductUnit } from "@atelier/shared";
import { getProduct, patchProduct, type ProductFull } from "@/src/api/products";
import { useI18n } from "@/src/hooks/useI18n";
import { apiErrorMessage } from "@/src/lib/api-error";
import { formatPrice } from "@/src/lib/money";
import {
  buildFixPatch,
  currentPieceWeightG,
  fixFields,
  formatGrams,
  initialGramsPerLitre,
  unitLabelKey,
} from "@/src/lib/ingredient-cost";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { showToast } from "./Toast";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const UNITS: ReadonlyArray<ProductUnit> = ["kg", "g", "l", "ml", "unidad", "caja"];
const DECIMAL_KEYBOARD = Platform.select({ ios: "decimal-pad", default: "numeric" } as const);

export type FixTarget = { productId: string; recipeUnit: string | null };

type Props = {
  target: FixTarget | null; // null = closed
  onClose: () => void;
  onSaved: () => void;
};

export function IngredientFixSheet({ target, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const [product, setProduct] = useState<ProductFull | null>(null);
  const [unit, setUnit] = useState<ProductUnit>("kg");
  const [price, setPrice] = useState("");
  const [gramsPerLitre, setGramsPerLitre] = useState("");
  const [densitySuggested, setDensitySuggested] = useState(false);
  const [pieceWeight, setPieceWeight] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const productId = target?.productId ?? null;
  useEffect(() => {
    setProduct(null);
    setError("");
    if (!productId) return;
    let current = true;
    getProduct(productId)
      .then((p) => {
        if (!current) return;
        const density = initialGramsPerLitre(p);
        const piece = currentPieceWeightG(p);
        setProduct(p);
        setUnit(p.unidadCompra);
        setPrice(p.precioCompra > 0 ? formatPrice(p.precioCompra) : "");
        setGramsPerLitre(formatGrams(density.value));
        setDensitySuggested(density.suggested);
        setPieceWeight(piece === null ? "" : formatGrams(piece));
      })
      .catch((err) => {
        if (!current) return;
        showToast(apiErrorMessage(err, t));
        onClose();
      });
    return () => {
      current = false;
    };
    // Load once per opened product; a new t/onClose must not refetch.
  }, [productId]);

  function close() {
    if (!busyRef.current) onClose();
  }

  const unitName = (u: string) => {
    const key = unitLabelKey(u);
    return key ? t(key) : u;
  };

  async function save() {
    if (!product || !target || busyRef.current) return;
    const result = buildFixPatch(product, target.recipeUnit, {
      unit,
      price,
      gramsPerLitre,
      pieceWeight,
    });
    if (!result.ok) {
      setError(t(result.error === "price" ? "fix_sheet_error_price" : "grams_invalid"));
      return;
    }
    if (Object.keys(result.patch).length === 0) {
      onClose();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await patchProduct(product.id, result.patch);
      if (!alive.current) return;
      showToast(t("toast_producto_saved"));
      onSaved();
    } catch (err) {
      if (alive.current) setError(apiErrorMessage(err, t));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const fields = product && target ? fixFields(target.recipeUnit, unit) : null;

  return (
    <BottomSheet open={target !== null} onClose={close} testID="ingredient-fix-sheet">
      {!product || !fields ? (
        <ActivityIndicator color={colors.terracota} style={styles.loading} />
      ) : (
        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{product.name}</Text>

          <Text style={styles.label}>{t("producto_form_unidad_label")}</Text>
          <View style={styles.pills}>
            {UNITS.map((u) => (
              <Pressable
                key={u}
                onPress={() => {
                  setUnit(u);
                  setError("");
                }}
                style={[styles.pill, unit === u && styles.pillActive]}
                disabled={busy}
              >
                <Text style={[styles.pillLabel, unit === u && styles.pillLabelActive]}>
                  {t(`unit_${u}` as const)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{t("fix_sheet_price_label", { unit: unitName(unit) })}</Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={(v) => {
              setPrice(v);
              setError("");
            }}
            keyboardType={DECIMAL_KEYBOARD}
            placeholder="0,00"
            placeholderTextColor={colors.mute}
            editable={!busy}
          />

          {fields.density ? (
            <>
              <Text style={styles.label}>{t("gramos_por_litro_label")}</Text>
              <TextInput
                style={styles.input}
                value={gramsPerLitre}
                onChangeText={(v) => {
                  setGramsPerLitre(v);
                  setDensitySuggested(false);
                  setError("");
                }}
                keyboardType={DECIMAL_KEYBOARD}
                editable={!busy}
              />
              <Text style={styles.hint}>
                {densitySuggested ? t("gramos_por_litro_suggested") : t("gramos_por_litro_hint")}
              </Text>
            </>
          ) : null}

          {fields.pieceWeight ? (
            <>
              <Text style={styles.label}>{t("peso_por_unidad_label")}</Text>
              <TextInput
                style={styles.input}
                value={pieceWeight}
                onChangeText={(v) => {
                  setPieceWeight(v);
                  setError("");
                }}
                keyboardType={DECIMAL_KEYBOARD}
                placeholder="—"
                placeholderTextColor={colors.mute}
                editable={!busy}
              />
            </>
          ) : null}

          {fields.incompatible ? <Text style={styles.note}>{t("fix_sheet_incompatible")}</Text> : null}

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button label={t("btn_save")} onPress={save} disabled={busy} />
            <Button label={t("confirm_cancel")} variant="secondary" onPress={close} disabled={busy} />
          </View>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: spacing.xxl },
  content: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: spacing.xs,
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paperSoft,
  },
  pillActive: { backgroundColor: colors.terracota, borderColor: colors.terracota },
  pillLabel: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  pillLabelActive: { color: colors.paper, fontWeight: "600" },
  input: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  hint: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute, fontStyle: "italic" },
  note: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
    lineHeight: fontSizes.bodySm * 1.4,
  },
  error: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.danger },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
