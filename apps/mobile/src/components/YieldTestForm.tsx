// Form de prueba de rendimiento (yield test) — Fase 6 del Banco de Productos.
//
// El chef carga peso bruto (lo que entró al kitchen) y peso útil (lo que
// quedó después de limpieza), y el server calcula la merma medida:
//   merma % = (1 - peso_util / peso_bruto) * 100
//
// La merma medida tiene PRIORIDAD: se guarda en YieldTest (histórico) y
// también actualiza Product.mermaPct + Product.mermaOrigen='medida'.
//
// Visibilidad (ver spec del banco):
//   - criticidad alta + merma sugerida → form PROMINENTE (badge, color terracota)
//   - criticidad alta o media          → form visible normal
//   - criticidad baja                  → oculto bajo "opciones avanzadas"
//
// Este componente se renderiza siempre que el padre decide mostrarlo. La
// lógica de visibilidad vive en [id].tsx. El flag `prominent` modula el
// estilo (border + heading destacado).

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createYieldTest, type ProductFull } from "@/src/api/products";
import { showToast } from "@/src/components/Toast";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import { apiErrorMessage } from "@/src/lib/api-error";

type Props = {
  productId: string;
  prominent: boolean;
  // Labels desde i18n del parent para mantener locale-correctness.
  labels: {
    title: string;
    prominentWarning: string;
    pesoBrutoLabel: string;
    pesoUtilLabel: string;
    notasLabel: string;
    notasPlaceholder: string;
    mermaPreviewLabel: string;
    saveLabel: string;
    errorPesoUtilExcedeBruto: string;
    errorInvalid: string;
  };
  onSuccess: (updatedProduct: ProductFull) => void;
};

function parseGrams(input: string): number | null {
  if (!input.trim()) return null;
  const n = Number(input.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function YieldTestForm({ productId, prominent, labels, onSuccess }: Props) {
  const { t } = useI18n();
  const [pesoBrutoInput, setPesoBrutoInput] = useState("");
  const [pesoUtilInput, setPesoUtilInput] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const pesoBruto = parseGrams(pesoBrutoInput);
  const pesoUtil = parseGrams(pesoUtilInput);

  // Preview en vivo. null si los inputs no están listos.
  let mermaPreview: number | null = null;
  let exceeded = false;
  if (pesoBruto !== null && pesoBruto > 0 && pesoUtil !== null) {
    if (pesoUtil > pesoBruto) {
      exceeded = true;
    } else {
      mermaPreview = Math.round((1 - pesoUtil / pesoBruto) * 1000) / 10;
    }
  }

  async function handleSave() {
    if (saving) return;
    if (pesoBruto === null || pesoBruto <= 0 || pesoUtil === null) {
      showToast(labels.errorInvalid);
      return;
    }
    if (pesoUtil > pesoBruto) {
      showToast(labels.errorPesoUtilExcedeBruto);
      return;
    }
    setSaving(true);
    try {
      const result = await createYieldTest(productId, {
        pesoBrutoG: pesoBruto,
        pesoUtilG: pesoUtil,
        notas: notas.trim() || undefined,
      });
      // Limpiar inputs después de save.
      setPesoBrutoInput("");
      setPesoUtilInput("");
      setNotas("");
      onSuccess(result.product);
    } catch (err) {
      showToast(apiErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  }

  const canSave = !saving && pesoBruto !== null && pesoBruto > 0 && pesoUtil !== null && !exceeded;

  return (
    <View style={[styles.wrapper, prominent && styles.wrapperProminent]}>
      <View style={styles.headerRow}>
        {prominent ? (
          <Ionicons name="flame" size={14} color={colors.terracota} />
        ) : (
          <Ionicons name="flask-outline" size={14} color={colors.inkSoft} />
        )}
        <Text style={[styles.heading, prominent && styles.headingProminent]}>
          {labels.title}
        </Text>
      </View>

      {prominent ? (
        <Text style={styles.prominentBody}>{labels.prominentWarning}</Text>
      ) : null}

      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{labels.pesoBrutoLabel}</Text>
          <TextInput
            value={pesoBrutoInput}
            onChangeText={setPesoBrutoInput}
            placeholder="0"
            placeholderTextColor={colors.mute}
            style={styles.input}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{labels.pesoUtilLabel}</Text>
          <TextInput
            value={pesoUtilInput}
            onChangeText={setPesoUtilInput}
            placeholder="0"
            placeholderTextColor={colors.mute}
            style={[styles.input, exceeded && styles.inputError]}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      {mermaPreview !== null ? (
        <Text style={styles.preview}>
          {labels.mermaPreviewLabel}: <Text style={styles.previewValue}>{mermaPreview.toFixed(1)}%</Text>
        </Text>
      ) : exceeded ? (
        <Text style={styles.previewError}>{labels.errorPesoUtilExcedeBruto}</Text>
      ) : null}

      <Text style={styles.label}>{labels.notasLabel}</Text>
      <TextInput
        value={notas}
        onChangeText={setNotas}
        placeholder={labels.notasPlaceholder}
        placeholderTextColor={colors.mute}
        style={[styles.input, styles.inputMulti]}
        multiline
        numberOfLines={2}
        maxLength={2000}
      />

      <Pressable
        onPress={handleSave}
        disabled={!canSave}
        style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
      >
        {saving ? (
          <ActivityIndicator color={colors.paper} size="small" />
        ) : (
          <>
            <Ionicons name="checkmark" size={14} color={colors.paper} />
            <Text style={styles.saveLabel}>{labels.saveLabel}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
    gap: spacing.sm,
  },
  wrapperProminent: {
    borderWidth: 1.5,
    borderColor: colors.terracota,
    backgroundColor: colors.terracotaSoft,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  heading: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "600",
  },
  headingProminent: { color: colors.terracota },
  prominentBody: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
    lineHeight: fontSizes.bodySm * 1.4,
  },
  row2: { flexDirection: "row", gap: spacing.sm },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginBottom: -spacing.xs,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    backgroundColor: colors.paper,
    borderRadius: radii.sm,
    borderWidth: 0.5,
    borderColor: colors.edge,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  inputError: { borderColor: colors.terracota },
  inputMulti: { minHeight: 50, textAlignVertical: "top" },
  preview: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
  },
  previewValue: { fontWeight: "600", color: colors.ink },
  previewError: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
});
