// Detalle de producto. Lectura + acciones (editar, archivar/reactivar).
// Inline edit de precio/merma queda para Fase 2 — por ahora todo se edita
// vía /productos/[id]/edit.
//
// El histórico de precios y los yield tests se cargan en una llamada separada
// (/api/products/:id/history) para que la primera vista del producto sea
// rápida y el histórico aparezca progresivamente.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { showToast } from "@/src/components/Toast";
import {
  getProduct,
  getProductHistory,
  patchProduct,
  type ProductFull,
  type ProductHistoryResponse,
} from "@/src/api/products";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function ProductoDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state: authState } = useAuth();

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canEdit = can(role, "manage_products");

  const [product, setProduct] = useState<ProductFull | null>(null);
  const [history, setHistory] = useState<ProductHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [archivePending, setArchivePending] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Producto primero (bloquea el render del hero), historial en paralelo.
      const [p, h] = await Promise.all([getProduct(id), getProductHistory(id)]);
      setProduct(p);
      setHistory(h);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function handleArchiveToggle() {
    if (!product) return;
    const next = product.estado === "archivado" ? "activo" : "archivado";
    try {
      await patchProduct(product.id, { estado: next });
      showToast(
        next === "archivado" ? t("toast_producto_archived") : t("toast_producto_unarchived"),
      );
      void reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  if (loading && !product) {
    return (
      <Screen title={t("header_productos")}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracota} />
        </View>
      </Screen>
    );
  }

  if (!product) {
    return (
      <Screen title={t("header_productos")}>
        <View style={styles.center}>
          <Text style={styles.errorText}>404</Text>
        </View>
      </Screen>
    );
  }

  const isArchived = product.estado === "archivado";
  const noPrice = product.precioCompra === 0;
  const isCritical = product.criticality === "alta";
  const daysSincePrice = Math.floor(
    (Date.now() - new Date(product.precioActualizadoAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  const priceIsOld = daysSincePrice >= 30 && !noPrice;

  return (
    <Screen title={t("header_productos")}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.heroBlock}>
          <View style={styles.titleRow}>
            {isCritical ? (
              <Ionicons
                name="flame"
                size={16}
                color={colors.terracota}
                style={{ marginRight: spacing.xs }}
              />
            ) : null}
            <Text style={styles.title}>{product.name}</Text>
          </View>
          <View style={styles.subRow}>
            <Text style={styles.subText}>{t(`category_${product.category}` as const)}</Text>
            {product.pezzatura ? (
              <Text style={styles.subText}>· {product.pezzatura}</Text>
            ) : null}
            <Text style={styles.subText}>· {t(`criticality_${product.criticality}` as const)}</Text>
            {isArchived ? (
              <Text style={[styles.subText, styles.archived]}>
                · {t("estado_producto_archivado")}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Costo real */}
        <View style={styles.bigStatBlock}>
          <Text style={styles.eyebrow}>{t("producto_real_cost_label")}</Text>
          <Text style={styles.bigStat}>
            {noPrice ? "—" : `€ ${(product.realCost / 100).toFixed(2)}`}
            <Text style={styles.bigStatUnit}>
              {noPrice ? "" : `/${t(`unit_${product.unidadCompra}` as const)}`}
            </Text>
          </Text>
          <Text style={styles.explainer}>{t("producto_real_cost_explainer")}</Text>
        </View>

        {/* Precio + merma */}
        <View style={styles.row2}>
          <View style={styles.miniStat}>
            <Text style={styles.eyebrow}>{t("producto_form_precio_label")}</Text>
            <Text style={styles.miniValue}>
              {noPrice ? "—" : `€ ${(product.precioCompra / 100).toFixed(2)}`}
            </Text>
            {priceIsOld ? (
              <Text style={styles.priceOld}>
                {t("producto_price_old_indicator", { days: daysSincePrice.toString() })}
              </Text>
            ) : null}
          </View>
          <View style={styles.miniStat}>
            <Text style={styles.eyebrow}>{t("producto_form_merma_label")}</Text>
            <Text style={styles.miniValue}>{product.mermaPct.toFixed(0)}%</Text>
            <Text
              style={[
                styles.miniSub,
                product.mermaOrigen === "sugerida" && styles.mermaWarn,
              ]}
            >
              {t(`merma_origen_${product.mermaOrigen}` as const)}
            </Text>
          </View>
        </View>

        {/* Proveedor / aliases / notas */}
        {product.proveedor ? (
          <Field label={t("producto_form_proveedor_label")} value={product.proveedor} />
        ) : null}
        {product.aliases.length > 0 ? (
          <Field
            label={t("producto_form_aliases_label")}
            value={product.aliases.join(", ")}
          />
        ) : null}
        {product.notas ? (
          <Field label={t("producto_form_notas_label")} value={product.notas} multiline />
        ) : null}

        {/* Acciones */}
        {canEdit ? (
          <View style={styles.actionsRow}>
            <Pressable
              style={styles.actionBtn}
              onPress={() =>
                router.push({ pathname: "/productos/editar", params: { id: product.id } })
              }
            >
              <Ionicons name="pencil-outline" size={14} color={colors.terracota} />
              <Text style={styles.actionLabel}>{t("btn_modificar")}</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={() => (isArchived ? handleArchiveToggle() : setArchivePending(true))}
            >
              <Ionicons
                name={isArchived ? "archive" : "archive-outline"}
                size={14}
                color={colors.terracota}
              />
              <Text style={styles.actionLabel}>
                {isArchived ? t("btn_desarchivar") : t("btn_archivar")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* En recetas (vacío en Fase 1) */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>{t("producto_used_in_recipes_label")}</Text>
          <Text style={styles.muted}>{t("producto_no_recipes_yet")}</Text>
        </View>

        {/* Histórico de precios */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>{t("producto_price_history_label")}</Text>
          {!history || history.priceHistory.length === 0 ? (
            <Text style={styles.muted}>{t("producto_no_price_history")}</Text>
          ) : (
            history.priceHistory.map((row) => (
              <View key={row.id} style={styles.historyRow}>
                <Text style={styles.historyDate}>
                  {new Date(row.createdAt).toLocaleDateString()}
                </Text>
                <Text style={styles.historyValue}>
                  € {(row.precio / 100).toFixed(2)} /{t(`unit_${row.unidadCompra}` as const)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Yield tests (Fase 6 los carga; Fase 1 muestra el placeholder) */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>{t("producto_yield_tests_label")}</Text>
          {!history || history.yieldTests.length === 0 ? (
            <Text style={styles.muted}>{t("producto_no_yield_tests")}</Text>
          ) : (
            history.yieldTests.map((row) => (
              <View key={row.id} style={styles.historyRow}>
                <Text style={styles.historyDate}>
                  {new Date(row.createdAt).toLocaleDateString()}
                </Text>
                <Text style={styles.historyValue}>
                  {row.pesoBrutoG} → {row.pesoUtilG} g · {row.mermaCalculadaPct.toFixed(0)}%
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <ConfirmSheet
        open={archivePending}
        title={t("confirm_archive_producto_title")}
        body={t("confirm_archive_producto_body")}
        confirmLabel={t("btn_archivar")}
        cancelLabel={t("confirm_cancel")}
        destructive
        onConfirm={() => {
          setArchivePending(false);
          void handleArchiveToggle();
        }}
        onCancel={() => setArchivePending(false)}
      />
    </Screen>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.eyebrow}>{label}</Text>
      <Text style={multiline ? styles.fieldMulti : styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.mute },
  heroBlock: { gap: spacing.xs },
  titleRow: { flexDirection: "row", alignItems: "center" },
  title: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    flexShrink: 1,
  },
  subRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  subText: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  archived: { color: colors.terracota, fontWeight: "600" },
  eyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  bigStatBlock: {
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
    gap: 4,
  },
  bigStat: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg + 4,
    color: colors.ink,
  },
  bigStatUnit: { fontSize: fontSizes.bodySm, color: colors.mute },
  explainer: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  row2: { flexDirection: "row", gap: spacing.md },
  miniStat: {
    flex: 1,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
    gap: 4,
  },
  miniValue: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink, fontWeight: "600" },
  miniSub: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  mermaWarn: { color: colors.terracota },
  priceOld: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.terracota },
  fieldBlock: { gap: 4 },
  fieldValue: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  fieldMulti: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    lineHeight: fontSizes.body * 1.5,
  },
  actionsRow: { flexDirection: "row", gap: spacing.sm },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.terracota,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
  },
  actionLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  section: { gap: spacing.xs },
  muted: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
  },
  historyDate: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  historyValue: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.ink },
});
