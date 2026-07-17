// Form de crear producto manualmente. Patrón calcado de recetas/nueva.tsx
// pero adaptado a campos del Banco. Categoría y unidad como pills horizontales
// (no hay picker nativo en RN, los pills son la convención del proyecto).
//
// Precio se ingresa como decimal en euros (12.50) y se persiste como entero
// en centavos (1250). Merma como porcentaje 0-100.

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/src/components/Screen";
import { useI18n } from "@/src/hooks/useI18n";
import { showToast } from "@/src/components/Toast";
import { createProduct } from "@/src/api/products";
import { PezzaturaField } from "@/src/components/PezzaturaField";
import type {
  ProductCategory,
  ProductUnit,
  CreateProductRequest,
} from "@atelier/shared";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { parseEurosToCents } from "@/src/lib/money";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const CATEGORIES: ReadonlyArray<ProductCategory> = [
  "pescado",
  "carne",
  "verdura",
  "fruta",
  "lacteo",
  "panaderia",
  "seco",
  "especia",
  "hierba",
  "vinagre_aceite",
  "otro",
];

const UNITS: ReadonlyArray<ProductUnit> = ["kg", "g", "l", "ml", "unidad", "caja"];

function parseMermaPct(input: string): number | null {
  if (!input.trim()) return null;
  const normalized = input.replace(",", ".").trim();
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export default function NuevoProductoScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const kb = useKeyboardHeight();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("otro");
  // Entrega A.5: pezzaturaInput es el structured field (parser lo transforma
  // en pezzaturaMode/Min/Max canónicos en el server). El campo legacy
  // `pezzatura: string` ya no se expone en el editor (queda en DB para
  // productos que lo tengan, deprecación gradual).
  const [pezzaturaInput, setPezzaturaInput] = useState("");
  const [unidad, setUnidad] = useState<ProductUnit>("kg");
  const [precioInput, setPrecioInput] = useState("");
  const [mermaInput, setMermaInput] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [notas, setNotas] = useState("");
  const [aliasesInput, setAliasesInput] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast(t("producto_form_name_label"));
      return;
    }
    const cents = parseEurosToCents(precioInput) ?? 0; // 0 = pendiente de precio
    const merma = parseMermaPct(mermaInput); // null si vacío → server usa default por categoría

    const aliases = aliasesInput
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    const payload: CreateProductRequest = {
      name: trimmedName,
      category,
      // pezzaturaInput se manda al server; el server parsea y persiste
      // pezzaturaMode/Min/Max canónicos. Si está vacío, server corre
      // detectPezzaturaFromName silencioso para auto-detect.
      pezzaturaInput: pezzaturaInput.trim() || undefined,
      unidadCompra: unidad,
      precioCompra: cents,
      mermaPct: merma ?? undefined,
      proveedor: proveedor.trim() || undefined,
      notas: notas.trim() || undefined,
      aliases: aliases.length > 0 ? aliases : undefined,
    };

    setSaving(true);
    try {
      const created = await createProduct(payload);
      showToast(t("toast_producto_saved"));
      router.replace({ pathname: "/productos/[id]", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    name,
    category,
    pezzaturaInput,
    unidad,
    precioInput,
    mermaInput,
    proveedor,
    notas,
    aliasesInput,
    router,
    t,
  ]);

  return (
    <Screen title={t("producto_form_title_nuevo")}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + kb }]}
        keyboardShouldPersistTaps="handled"
      >
          {/* Nombre */}
          <Text style={styles.label}>{t("producto_form_name_label")}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("producto_form_name_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.input}
            autoFocus
            maxLength={200}
          />

          {/* Categoría */}
          <Text style={styles.label}>{t("producto_form_category_label")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}
            style={styles.pillsScroll}
          >
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.pill, category === c && styles.pillActive]}
              >
                <Text
                  style={[
                    styles.pillLabel,
                    category === c && styles.pillLabelActive,
                  ]}
                >
                  {t(`category_${c}` as const)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Pezzatura — solo aparece si la categoría/nombre la admite */}
          <PezzaturaField
            name={name}
            category={category}
            value={pezzaturaInput}
            onChangeValue={setPezzaturaInput}
            recipesUsingByUnitCount={0}
          />

          {/* Unidad */}
          <Text style={styles.label}>{t("producto_form_unidad_label")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}
            style={styles.pillsScroll}
          >
            {UNITS.map((u) => (
              <Pressable
                key={u}
                onPress={() => setUnidad(u)}
                style={[styles.pill, unidad === u && styles.pillActive]}
              >
                <Text
                  style={[styles.pillLabel, unidad === u && styles.pillLabelActive]}
                >
                  {t(`unit_${u}` as const)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Precio + Merma en fila */}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t("producto_form_precio_label")}</Text>
              <TextInput
                value={precioInput}
                onChangeText={setPrecioInput}
                placeholder="0.00"
                placeholderTextColor={colors.mute}
                style={styles.input}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t("producto_form_merma_label")}</Text>
              <TextInput
                value={mermaInput}
                onChangeText={setMermaInput}
                placeholder="0"
                placeholderTextColor={colors.mute}
                style={styles.input}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Proveedor */}
          <Text style={styles.label}>{t("producto_form_proveedor_label")}</Text>
          <TextInput
            value={proveedor}
            onChangeText={setProveedor}
            placeholder={t("producto_form_proveedor_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.input}
            maxLength={200}
          />

          {/* Aliases */}
          <Text style={styles.label}>{t("producto_form_aliases_label")}</Text>
          <TextInput
            value={aliasesInput}
            onChangeText={setAliasesInput}
            placeholder={t("producto_form_aliases_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Notas */}
          <Text style={styles.label}>{t("producto_form_notas_label")}</Text>
          <TextInput
            value={notas}
            onChangeText={setNotas}
            placeholder={t("producto_form_notas_placeholder")}
            placeholderTextColor={colors.mute}
            style={[styles.input, styles.inputMulti]}
            multiline
            numberOfLines={3}
            maxLength={2000}
          />

          <Pressable
            onPress={handleSave}
            disabled={saving || !name.trim()}
            style={[styles.saveBtn, (saving || !name.trim()) && styles.saveBtnDisabled]}
          >
            {saving ? (
              <ActivityIndicator color={colors.paper} size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color={colors.paper} />
                <Text style={styles.saveLabel}>{t("btn_save")}</Text>
              </>
            )}
          </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
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
  },
  inputMulti: { minHeight: 80, textAlignVertical: "top" },
  row2: { flexDirection: "row", gap: spacing.md },
  pillsScroll: { flexGrow: 0, flexShrink: 0 },
  pillsRow: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    alignItems: "center",
  },
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
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
});
