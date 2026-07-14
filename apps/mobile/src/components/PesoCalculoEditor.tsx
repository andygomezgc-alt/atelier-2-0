// Entrega A.5 — Fase 7: Override del "peso por pieza" para un ingrediente
// puntual de una receta. Inline editor + modal.
//
// Aplica solo cuando:
//   - El ingrediente de la receta usa unit ∈ ("piezas", "unidad").
//   - El producto enlazado tiene pezzatura del banco (pezzaturaMode != null).
//
// El override (`pesoCalculoG`) representa SIEMPRE el peso BRUTO de la pieza
// entera (antes de pelar/limpiar). Esto cierra ambigüedad culinaria: si el
// chef quiere considerar el peso útil ajusta la merma del producto en el
// banco, NO mete el peso útil acá. Decisión documentada en el modal y en
// cost.ts.
//
// Estados visuales:
//   - Sin override → "Peso por pieza: 58 g (del banco) · Personalizar"
//   - Con override → "Peso por pieza: 70 g (personalizado) · Volver al banco"
//
// Aviso de fuera de rango: si el override está fuera del rango del banco
// más de 2x (high) o menos de 0.5x (low), mensaje suave no bloqueante.

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { PezzaturaMode } from "@atelier/shared";
import { useI18n } from "@/src/hooks/useI18n";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  pezzaturaMode: PezzaturaMode;
  pezzaturaMin: number; // canónico: pz/kg si mode=pz_per_kg, gramos si g_per_piece
  pezzaturaMax: number;
  value: number | null; // pesoCalculoG actual (gramos por pieza)
  onChange: (next: number | null) => void;
};

// Calcula el rango de peso por pieza (en gramos) a partir de la pezzatura
// del banco. Para pz_per_kg: invertir (min pz/kg → max g/pz, max pz/kg → min g/pz).
function bankPesoRangeG(
  mode: PezzaturaMode,
  min: number,
  max: number,
): { minG: number; maxG: number; midG: number } {
  if (mode === "g_per_piece") {
    return { minG: min, maxG: max, midG: (min + max) / 2 };
  }
  // pz_per_kg: min pz/kg = gambero grande → max g/pz. max pz/kg = chico → min g/pz.
  const minG = 1000 / max;
  const maxG = 1000 / min;
  const midPz = (min + max) / 2;
  return { minG, maxG, midG: 1000 / midPz };
}

function fmtG(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1).replace(".", ",");
}

export function PesoCalculoEditor({
  pezzaturaMode,
  pezzaturaMin,
  pezzaturaMax,
  value,
  onChange,
}: Props) {
  const { t } = useI18n();
  const kb = useKeyboardHeight();
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const range = bankPesoRangeG(pezzaturaMode, pezzaturaMin, pezzaturaMax);

  // El "peso del banco" mostrado al chef es el punto medio canónico.
  const bankMidG = Math.round(range.midG);
  const isCustom = value !== null && value > 0;
  const displayG = isCustom ? value : bankMidG;

  // Aviso fuera de rango: el override está > 2x del punto medio o < 0.5x.
  const outOfRange =
    isCustom && (value / range.midG > 2 || value / range.midG < 0.5);

  useEffect(() => {
    if (modalOpen) {
      setDraft(isCustom ? String(value) : "");
      setError(null);
      const tm = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(tm);
    }
  }, [modalOpen, value, isCustom]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      // Vacío = limpiar override (= "Volver al banco").
      onChange(null);
      setModalOpen(false);
      return;
    }
    const n = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError(t("producto_form_pezzatura_error"));
      return;
    }
    onChange(n);
    setModalOpen(false);
  };

  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.label}>
          {t("peso_por_pieza_label")}:{" "}
          <Text style={styles.value}>
            {isCustom
              ? t("peso_por_pieza_custom", { g: fmtG(displayG) })
              : t("peso_por_pieza_from_bank", { g: fmtG(displayG) })}
          </Text>
        </Text>
        {isCustom ? (
          <Pressable onPress={() => onChange(null)} hitSlop={6}>
            <Text style={styles.action}>{t("peso_por_pieza_back_to_bank")}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setModalOpen(true)} hitSlop={6}>
            <Text style={styles.action}>{t("peso_por_pieza_customize")}</Text>
          </Pressable>
        )}
      </View>
      {outOfRange && (
        <Text style={styles.softWarning}>
          {t("peso_por_pieza_out_of_range", {
            minG: fmtG(Math.round(range.minG)),
            maxG: fmtG(Math.round(range.maxG)),
          })}
        </Text>
      )}

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, { paddingBottom: kb }]}
          onPress={() => setModalOpen(false)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {t("peso_por_pieza_modal_title")}
            </Text>
            <Text style={styles.modalHint}>
              {t("peso_por_pieza_modal_hint")}
            </Text>
            <TextInput
              ref={inputRef}
              style={[styles.input, error && styles.inputError]}
              value={draft}
              onChangeText={(v) => {
                setDraft(v);
                if (error) setError(null);
              }}
              keyboardType="numeric"
              placeholder={`${bankMidG}`}
              placeholderTextColor={colors.mute}
              onSubmitEditing={handleSave}
              returnKeyType="done"
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.btnSecondary}
                onPress={() => setModalOpen(false)}
              >
                <Text style={styles.btnSecondaryText}>
                  {t("pezzatura_pendiente_later")}
                </Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={handleSave}>
                <Text style={styles.btnPrimaryText}>
                  {t("pezzatura_pendiente_save")}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Silenciador del unused warning si algún build falla por imports muertos.
void ActivityIndicator;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  label: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
  },
  value: { color: colors.inkSoft, fontWeight: "500" },
  action: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    fontWeight: "600",
  },
  softWarning: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    fontStyle: "italic",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalSheet: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 420,
    gap: spacing.sm,
  },
  modalTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifMd,
    color: colors.ink,
  },
  modalHint: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
    lineHeight: fontSizes.bodySm * 1.4,
  },
  input: {
    marginTop: spacing.sm,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  inputError: { borderColor: colors.terracota },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btnSecondary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
  },
  btnSecondaryText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
  },
  btnPrimary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    minWidth: 96,
    alignItems: "center",
  },
  btnPrimaryText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.paper,
    fontWeight: "600",
  },
});
