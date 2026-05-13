// Editar producto. Lee `id` del query param (en lugar de un subroute
// [id]/edit.tsx — Expo Router pierde el tipo de params cuando un dynamic
// segment se convierte en directorio). PATCH al guardar.
//
// Incluye control de criticality: si el chef elige "auto" se marca
// criticalityManual=false y el server recompila por categoría + name. Si
// elige una específica, el server marca criticalityManual=true.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { useI18n } from "@/src/hooks/useI18n";
import { showToast } from "@/src/components/Toast";
import { getProduct, patchProduct } from "@/src/api/products";
import type {
  Criticality,
  PatchProductRequest,
  ProductCategory,
  ProductUnit,
} from "@atelier/shared";
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
const CRITICALITIES: ReadonlyArray<Criticality> = ["alta", "media", "baja"];

function parseEurosToCents(input: string): number | null {
  if (!input.trim()) return null;
  const n = Number(input.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
function parseMermaPct(input: string): number | null {
  if (!input.trim()) return null;
  const n = Number(input.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export default function EditarProductoScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("otro");
  const [pezzatura, setPezzatura] = useState("");
  const [unidad, setUnidad] = useState<ProductUnit>("kg");
  const [precioInput, setPrecioInput] = useState("");
  const [mermaInput, setMermaInput] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [notas, setNotas] = useState("");
  const [aliasesInput, setAliasesInput] = useState("");

  const [criticality, setCriticality] = useState<Criticality | "auto">("auto");
  const [originalCriticality, setOriginalCriticality] = useState<Criticality>("media");
  const [wasManual, setWasManual] = useState(false);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const p = await getProduct(id);
        setName(p.name);
        setCategory(p.category);
        setPezzatura(p.pezzatura ?? "");
        setUnidad(p.unidadCompra);
        setPrecioInput(p.precioCompra > 0 ? (p.precioCompra / 100).toFixed(2) : "");
        setMermaInput(p.mermaPct.toFixed(2).replace(/\.?0+$/, ""));
        setProveedor(p.proveedor ?? "");
        setNotas(p.notas ?? "");
        setAliasesInput(p.aliases.join(", "));
        setOriginalCriticality(p.criticality);
        setWasManual(p.criticalityManual);
        setCriticality(p.criticalityManual ? p.criticality : "auto");
      } catch (err) {
        showToast(err instanceof Error ? err.message : t("error_network"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, t]);

  const handleSave = useCallback(async () => {
    if (!id || saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast(t("producto_form_name_label"));
      return;
    }
    const cents = parseEurosToCents(precioInput) ?? 0;
    const merma = parseMermaPct(mermaInput);

    const aliases = aliasesInput
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    const payload: PatchProductRequest = {
      name: trimmedName,
      category,
      pezzatura: pezzatura.trim() || null,
      unidadCompra: unidad,
      precioCompra: cents,
      mermaPct: merma ?? undefined,
      proveedor: proveedor.trim() || null,
      notas: notas.trim() || null,
      aliases,
    };

    // criticality: "auto" → reset manual flag. Específica → mandar valor
    // (el server marca manual). Para no spamear el manual flag, solo
    // mandamos criticality si efectivamente cambió o si el actual no era
    // manual y queremos forzar manual.
    if (criticality === "auto") {
      if (wasManual) payload.criticalityManual = false;
    } else if (criticality !== originalCriticality || !wasManual) {
      payload.criticality = criticality;
    }

    setSaving(true);
    try {
      await patchProduct(id, payload);
      showToast(t("toast_producto_saved"));
      router.back();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setSaving(false);
    }
  }, [
    id,
    saving,
    name,
    category,
    pezzatura,
    unidad,
    precioInput,
    mermaInput,
    proveedor,
    notas,
    aliasesInput,
    criticality,
    originalCriticality,
    wasManual,
    router,
    t,
  ]);

  if (loading) {
    return (
      <Screen title={t("producto_form_title_edit")}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracota} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={t("producto_form_title_edit")}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>{t("producto_form_name_label")}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("producto_form_name_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.input}
            maxLength={200}
          />

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

          <Text style={styles.label}>{t("producto_form_pezzatura_label")}</Text>
          <TextInput
            value={pezzatura}
            onChangeText={setPezzatura}
            placeholder={t("producto_form_pezzatura_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.input}
            maxLength={100}
          />

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

          <Text style={styles.label}>
            {t("criticality_alta")} / {t("criticality_media")} / {t("criticality_baja")}
          </Text>
          <View style={styles.criticalityRow}>
            <Pressable
              onPress={() => setCriticality("auto")}
              style={[styles.pill, criticality === "auto" && styles.pillActive]}
            >
              <Text style={[styles.pillLabel, criticality === "auto" && styles.pillLabelActive]}>
                auto
              </Text>
            </Pressable>
            {CRITICALITIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCriticality(c)}
                style={[styles.pill, criticality === c && styles.pillActive]}
              >
                <Text
                  style={[styles.pillLabel, criticality === c && styles.pillLabelActive]}
                >
                  {t(`criticality_${c}` as const)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{t("producto_form_proveedor_label")}</Text>
          <TextInput
            value={proveedor}
            onChangeText={setProveedor}
            placeholder={t("producto_form_proveedor_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.input}
            maxLength={200}
          />

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
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  criticalityRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
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
