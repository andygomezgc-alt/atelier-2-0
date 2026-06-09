// Entrega A.5 — Campo de pezzatura para el editor de productos.
//
// Visibilidad (sección 4 del spec):
//   - resolvePezzaturaMode(name, category) === null → no renderiza nada.
//   - Categoría admite pezzatura, ninguna receta usa el producto por unidad →
//     se muestra en accordion "Más opciones" (colapsable, expand para editar).
//   - Categoría admite, alguna receta lo usa por unidad → vista principal
//     directo (sin accordion), con autoFocus en mount.
//
// Validación: en blur corre parsePezzatura(input, category, name).
//   - Si parsea null → error inline.
//   - Si parsea OK → normaliza el input al canónico (formatPezzatura).
//
// El padre maneja el value (controlado) y onChangeValue. El payload del
// PATCH/POST lo arma el padre con el valor crudo del input — el server hace
// el parse definitivo. Esta validación es feedback inmediato, no autoridad.

import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  formatPezzatura,
  parsePezzatura,
  resolvePezzaturaMode,
  type ProductCategory,
} from "@atelier/shared";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  name: string;
  category: ProductCategory;
  value: string;
  onChangeValue: (v: string) => void;
  // Cuántas recetas distintas usan este producto con unit=piezas/unidad.
  // Si > 0, el campo sube a vista principal. Si === 0 vive en accordion.
  // En "nuevo producto" siempre es 0 (el producto no existe aún).
  recipesUsingByUnitCount?: number;
};

export function PezzaturaField({
  name,
  category,
  value,
  onChangeValue,
  recipesUsingByUnitCount = 0,
}: Props) {
  const { t } = useI18n();
  const mode = resolvePezzaturaMode(name, category);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Si la categoría/nombre no admite pezzatura, no renderiza nada.
  // Esto se evalúa de nuevo si el name o category cambian (ej. el chef
  // editó la categoría arriba), así el campo aparece/desaparece dinámico.
  if (mode === null) return null;

  const inMainView = recipesUsingByUnitCount > 0;
  const hint =
    mode === "pz_per_kg"
      ? t("producto_form_pezzatura_hint_pz_per_kg")
      : t("producto_form_pezzatura_hint_g_per_piece");

  const handleBlur = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(null);
      return;
    }
    const parsed = parsePezzatura(trimmed, category, name);
    if (!parsed) {
      setError(t("producto_form_pezzatura_error"));
      return;
    }
    setError(null);
    // Normaliza el input al canónico ("2-4kg" → "2-4 kg", "15-20" → "15/20")
    // para que el chef vea el formato uniforme.
    const canonical = formatPezzatura(parsed);
    if (canonical !== trimmed) onChangeValue(canonical);
  };

  const handleChange = (next: string) => {
    onChangeValue(next);
    if (error) setError(null); // limpia error mientras escribe
  };

  const inputBlock = (
    <>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onBlur={handleBlur}
        placeholder={hint}
        placeholderTextColor={colors.mute}
        style={[styles.input, error && styles.inputError]}
        maxLength={100}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );

  // Vista principal: campo siempre visible, sin accordion.
  if (inMainView) {
    return (
      <View>
        <Text style={styles.label}>{t("producto_form_pezzatura_label")}</Text>
        {inputBlock}
      </View>
    );
  }

  // Accordion: campo escondido hasta que el chef toca "Más opciones".
  return (
    <View>
      <Pressable
        style={styles.accordionHeader}
        onPress={() => setExpanded((e) => !e)}
      >
        <Text style={styles.accordionLabel}>
          {t("producto_form_pezzatura_more_options")}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.mute}
        />
      </Pressable>
      {expanded && (
        <View style={styles.accordionBody}>
          <Text style={styles.label}>
            {t("producto_form_pezzatura_label")}
          </Text>
          {inputBlock}
        </View>
      )}
    </View>
  );
}

// Hook auxiliar para los forms: dado un detail/producto, recupera el valor
// canónico actual como string ("15/20", "4-6 kg", etc.) para pre-popular el
// input. Si los structured campos están en null, retorna "".
export function getInitialPezzaturaInput(p: {
  pezzaturaMode: "pz_per_kg" | "g_per_piece" | null;
  pezzaturaMin: number | null;
  pezzaturaMax: number | null;
}): string {
  if (!p.pezzaturaMode || p.pezzaturaMin === null || p.pezzaturaMax === null)
    return "";
  return formatPezzatura({
    mode: p.pezzaturaMode,
    min: p.pezzaturaMin,
    max: p.pezzaturaMax,
  });
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: -spacing.xs,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  inputError: { borderColor: colors.terracota },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
    marginTop: spacing.xs,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  accordionLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  accordionBody: { gap: spacing.sm, paddingBottom: spacing.sm },
});
