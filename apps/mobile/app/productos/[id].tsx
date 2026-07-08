// Detalle de producto — minimalismo Andy 2026-05-15.
//
// Filosofía: lo importante en grande (costo real), el resto detrás de
// "Más opciones". Toda la edición es inline (no hay botón "Modificar").
// Criticidad invisible al chef.
//
// Layout:
//   [Hero]         nombre (inline edit) + categoría
//   [Cuesta real]  costo derivado, hero card
//   [Compra]       inline editable
//   [Merma]        inline editable
//   [Precio viejo] solo si > 7 días sin actualizar
//   [Más opciones] acordeón colapsable que contiene:
//                    - pezzatura, proveedor, notas (inline editables)
//                    - aliases (read-only)
//                    - registrar prueba (YieldTestForm uniforme)
//                    - histórico de precios (lista inline)
//                    - archivar/reactivar

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { EditableCell } from "@/src/components/EditableCell";
import { YieldTestForm } from "@/src/components/YieldTestForm";
import { DebouncedTextInput } from "@/src/components/DebouncedTextInput";
import { ChoiceSheet, type ChoiceOption } from "@/src/components/ChoiceSheet";
import { useI18n, dateLocale } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { showToast } from "@/src/components/Toast";
import { StatusBadge } from "@/src/components/StatusBadge";
import {
  getProduct,
  getProductHistory,
  patchProduct,
  type ProductFull,
  type ProductHistoryResponse,
} from "@/src/api/products";
import { can, resolvePezzaturaMode } from "@atelier/shared";
import type { ProductCategory, ProductUnit } from "@atelier/shared";
import { getInitialPezzaturaInput } from "@/src/components/PezzaturaField";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const UNIT_SHORT: Record<ProductUnit, string> = {
  kg: "kg",
  g: "g",
  l: "l",
  ml: "ml",
  unidad: "ud",
  caja: "caja",
};

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

function realCostLocal(cents: number, mermaPct: number): number {
  if (mermaPct >= 100) return cents;
  return Math.ceil(cents / (1 - mermaPct / 100));
}

export default function ProductoDetailScreen() {
  const { t, lang } = useI18n();
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
  const [unarchivePending, setUnarchivePending] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showYieldForm, setShowYieldForm] = useState(false);
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  // Sub-paso 2b: sheets para editar categoría y unidad con listas cerradas.
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [unitSheetOpen, setUnitSheetOpen] = useState(false);

  // Opciones de los pickers — useMemo para que se actualicen cuando cambia
  // el idioma del chef (t es estable en useI18n con [lang] dep).
  const categoryOptions = useMemo<ReadonlyArray<ChoiceOption<ProductCategory>>>(
    () => [
      { value: "pescado", label: t("category_pescado") },
      { value: "carne", label: t("category_carne") },
      { value: "verdura", label: t("category_verdura") },
      { value: "fruta", label: t("category_fruta") },
      { value: "lacteo", label: t("category_lacteo") },
      { value: "panaderia", label: t("category_panaderia") },
      { value: "seco", label: t("category_seco") },
      { value: "especia", label: t("category_especia") },
      { value: "hierba", label: t("category_hierba") },
      { value: "vinagre_aceite", label: t("category_vinagre_aceite") },
      { value: "otro", label: t("category_otro") },
    ],
    [t],
  );
  const unitOptions = useMemo<ReadonlyArray<ChoiceOption<ProductUnit>>>(
    () => [
      { value: "kg", label: t("unit_kg") },
      { value: "g", label: t("unit_g") },
      { value: "l", label: t("unit_l") },
      { value: "ml", label: t("unit_ml") },
      { value: "unidad", label: t("unit_unidad") },
      { value: "caja", label: t("unit_caja") },
    ],
    [t],
  );

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
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

  // Inline save helper genérico — para cualquier patch parcial. Optimistic
  // update + revert en error. Reusa el patrón del listado.
  const handleInlineSave = useCallback(
    async <K extends keyof ProductFull>(field: K, value: ProductFull[K]) => {
      if (!product) return;
      const before = product;
      // Optimistic
      setProduct({ ...product, [field]: value } as ProductFull);
      try {
        const updated = await patchProduct(product.id, { [field]: value } as never);
        setProduct(updated);
      } catch (err) {
        setProduct(before);
        throw err;
      }
    },
    [product],
  );

  // Save de precio: además de actualizar precio, recompila realCost local
  // optimista (el server lo confirma después).
  const handleSavePrice = useCallback(
    async (cents: number) => {
      if (!product) return;
      const before = product;
      setProduct({
        ...product,
        precioCompra: cents,
        realCost: realCostLocal(cents, product.mermaPct),
        precioActualizadoAt: new Date().toISOString(),
      });
      try {
        const updated = await patchProduct(product.id, { precioCompra: cents });
        setProduct(updated);
        void reload(); // refrescar history (nueva fila en ProductPriceHistory)
      } catch (err) {
        setProduct(before);
        throw err;
      }
    },
    [product, reload],
  );

  // Save de merma: recompila realCost + el server flipea mermaOrigen a
  // "confirmada" automáticamente (Fase 1 lógica).
  const handleSaveMerma = useCallback(
    async (pct: number) => {
      if (!product) return;
      const before = product;
      setProduct({
        ...product,
        mermaPct: pct,
        realCost: realCostLocal(product.precioCompra, pct),
        mermaOrigen: "confirmada",
      });
      try {
        const updated = await patchProduct(product.id, { mermaPct: pct });
        setProduct(updated);
      } catch (err) {
        setProduct(before);
        throw err;
      }
    },
    [product],
  );

  // Save de nombre — usa DebouncedTextInput (auto-save on blur).
  // Si falla, hace toast pero no podemos restaurar el input (el DTI no expone
  // status). Compromise: showToast lleva al usuario a re-abrir el detalle si
  // quiere verificar. La mayoría de los errores acá serían de red, y el
  // optimistic update mantiene el nombre visible mientras tanto.
  const handleSaveName = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (!trimmed || !product || trimmed === product.name) return;
      void handleInlineSave("name", trimmed).catch((err) => {
        showToast(err instanceof Error ? err.message : t("error_network"));
      });
    },
    [product, handleInlineSave, t],
  );

  const handleSaveSimpleField = useCallback(
    (field: "proveedor" | "notas") => (next: string) => {
      if (!product) return;
      const trimmed = next.trim();
      const nextValue = trimmed.length === 0 ? null : trimmed;
      if (nextValue === product[field]) return;
      void handleInlineSave(field, nextValue).catch((err) => {
        showToast(err instanceof Error ? err.message : t("error_network"));
      });
    },
    [product, handleInlineSave, t],
  );

  // Entrega A.5 — guardar pezzatura. Manda el input crudo al server, que
  // parsea con parsePezzatura(input, category, name) y persiste los 3
  // structured fields (mode/min/max). NO usa el campo legacy `pezzatura`.
  // Si el server rechaza con 400 (input inválido para la categoría), revert
  // optimistic y muestra toast.
  const handleSavePezzatura = useCallback(
    async (next: string) => {
      if (!product) return;
      const trimmed = next.trim();
      const previousInput = getInitialPezzaturaInput(product);
      if (trimmed === previousInput) return;
      const before = product;
      try {
        const updated = await patchProduct(product.id, {
          pezzaturaInput: trimmed === "" ? null : trimmed,
        });
        setProduct(updated);
      } catch (err) {
        setProduct(before);
        showToast(err instanceof Error ? err.message : t("error_network"));
      }
    },
    [product, t],
  );

  const handleSaveCategory = useCallback(
    async (next: ProductCategory) => {
      setCategorySheetOpen(false);
      if (!product || product.category === next) return;
      try {
        await handleInlineSave("category", next);
      } catch (err) {
        showToast(err instanceof Error ? err.message : t("error_network"));
      }
    },
    [product, handleInlineSave, t],
  );

  const handleSaveUnit = useCallback(
    async (next: ProductUnit) => {
      setUnitSheetOpen(false);
      if (!product || product.unidadCompra === next) return;
      try {
        await handleInlineSave("unidadCompra", next);
      } catch (err) {
        showToast(err instanceof Error ? err.message : t("error_network"));
      }
    },
    [product, handleInlineSave, t],
  );

  async function handleArchiveToggle() {
    if (!product) return;
    const next = product.estado === "archivado" ? "activo" : "archivado";
    try {
      const updated = await patchProduct(product.id, { estado: next });
      setProduct(updated);
      showToast(
        next === "archivado" ? t("toast_producto_archived") : t("toast_producto_unarchived"),
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  if (loading && !product) {
    return (
      <Screen title={t("header_productos")} back onBack={() => router.back()}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracota} />
        </View>
      </Screen>
    );
  }

  if (!product) {
    return (
      <Screen title={t("header_productos")} back onBack={() => router.back()}>
        <View style={styles.center}>
          <Text style={styles.errorText}>404</Text>
        </View>
      </Screen>
    );
  }

  const noPrice = product.precioCompra === 0;
  const isArchived = product.estado === "archivado";
  // canEditFields combina permiso del rol + estado del producto: si está
  // archivado nadie edita inline (Andy 2026-05-15). Para volver a editar
  // hay que desarchivar primero. La única acción que sigue activa en
  // archivado es "Desarchivar" (vive en el acordeón).
  const canEditFields = canEdit && !isArchived;
  const daysSincePrice = Math.floor(
    (Date.now() - new Date(product.precioActualizadoAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  // Precios de pescado/marisco/carne fluctúan rápido; 5 días para todo
  // es buen compromiso entre ruido y aviso temprano (Andy 2026-05-15).
  const priceIsOld = daysSincePrice >= 5 && !noPrice;
  const unitShort = UNIT_SHORT[product.unidadCompra];

  return (
    <Screen title={t("header_productos")} back onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Banda "Archivado" — solo cuando aplica. Discreta, una línea,
            tono apagado. Sustituye al texto "· Archivado" anterior que
            iba mezclado con la categoría y se notaba poco. */}
        {isArchived ? (
          <StatusBadge level="info" label={t("archived_banner_label")} />
        ) : null}

        {/* Hero: nombre (inline editable solo si NO archivado) + categoría */}
        <View style={styles.heroBlock}>
          {canEditFields ? (
            <DebouncedTextInput
              value={product.name}
              onSave={handleSaveName}
              style={styles.heroNameInput}
              maxLength={200}
            />
          ) : (
            <Text style={styles.heroName}>{product.name}</Text>
          )}
          <View style={styles.subRow}>
            <Text style={styles.subText}>{t(`category_${product.category}` as const)}</Text>
            {/* Entrega A.5: muestro la pezzatura structured canónica si está
                cargada. Si no, fallback al legacy string (productos viejos). */}
            {getInitialPezzaturaInput(product) ? (
              <Text style={styles.subText}>· {getInitialPezzaturaInput(product)}</Text>
            ) : product.pezzatura ? (
              <Text style={styles.subText}>· {product.pezzatura}</Text>
            ) : null}
          </View>
        </View>

        {/* Hero: costo real */}
        <View style={styles.bigStatBlock}>
          <Text style={styles.eyebrow}>{t("producto_real_cost_label")}</Text>
          <Text style={styles.bigStat}>
            {noPrice ? "—" : `${(product.realCost / 100).toFixed(2)} €`}
            <Text style={styles.bigStatUnit}>{noPrice ? "" : ` / ${unitShort} útil`}</Text>
          </Text>
        </View>

        {/* Compra + Merma — inline editable, layout planilla. Bloqueado
            cuando el producto está archivado (canEditFields incluye ese check). */}
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>{t("producto_form_precio_label")}</Text>
          <View style={styles.fieldValueGroup}>
            <EditableCell
              value={product.precioCompra}
              format={(c) => `${(c / 100).toFixed(2)} €`}
              parse={parseEurosToCents}
              onSave={handleSavePrice}
              placeholderForZero="—"
              readOnly={!canEditFields}
              width={92}
            />
            <Text style={styles.unitHint}>/ {unitShort}</Text>
          </View>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>{t("producto_form_merma_label")}</Text>
          <EditableCell
            value={product.mermaPct}
            format={(v) => `${v.toFixed(0)} %`}
            parse={parseMermaPct}
            onSave={handleSaveMerma}
            readOnly={!canEditFields}
            width={64}
          />
        </View>

        {/* Aviso de precio viejo (>7 días). Solo aparece si hay precio. */}
        {priceIsOld ? (
          <Text style={styles.priceOldHint}>
            {t("producto_price_old_indicator", { days: daysSincePrice.toString() })}
          </Text>
        ) : null}

        {/* Más opciones — acordeón */}
        <Pressable
          style={styles.moreToggle}
          onPress={() => setShowMore((v) => !v)}
        >
          <Ionicons
            name={showMore ? "chevron-down" : "chevron-forward"}
            size={14}
            color={colors.inkSoft}
          />
          <Text style={styles.moreLabel}>{t("producto_more_options")}</Text>
        </Pressable>

        {showMore ? (
          <View style={styles.moreContent}>
            {/* Categoría y Unidad — tap abre ChoiceSheet con lista cerrada
                de opciones. Bloqueados cuando archivado (consistente con
                el resto de inline edits). */}
            <FieldTappable
              label={t("producto_form_category_label")}
              value={t(`category_${product.category}` as const)}
              editable={canEditFields}
              onTap={() => setCategorySheetOpen(true)}
            />
            <FieldTappable
              label={t("producto_form_unidad_label")}
              value={t(`unit_${product.unidadCompra}` as const)}
              editable={canEditFields}
              onTap={() => setUnitSheetOpen(true)}
            />
            {/* Entrega A.5 — campo pezzatura. Solo se muestra si la categoría
                + nombre admiten pezzatura (gambero/scampi/pichón/ricciola/etc.).
                value canónico viene de los structured fields del producto;
                el save manda pezzaturaInput al server (no el legacy string). */}
            {resolvePezzaturaMode(product.name, product.category) !== null ? (
              <FieldEditable
                label={t("producto_form_pezzatura_label")}
                value={getInitialPezzaturaInput(product)}
                onSave={handleSavePezzatura}
                placeholder={
                  resolvePezzaturaMode(product.name, product.category) === "pz_per_kg"
                    ? t("producto_form_pezzatura_hint_pz_per_kg")
                    : t("producto_form_pezzatura_hint_g_per_piece")
                }
                editable={canEditFields}
              />
            ) : null}
            <FieldEditable
              label={t("producto_form_proveedor_label")}
              value={product.proveedor ?? ""}
              onSave={handleSaveSimpleField("proveedor")}
              placeholder={t("producto_form_proveedor_placeholder")}
              editable={canEditFields}
            />
            <FieldReadonly
              label={t("producto_form_aliases_label")}
              value={
                product.aliases.length > 0 ? product.aliases.join(", ") : "—"
              }
            />
            <FieldEditable
              label={t("producto_form_notas_label")}
              value={product.notas ?? ""}
              onSave={handleSaveSimpleField("notas")}
              placeholder={t("producto_form_notas_placeholder")}
              editable={canEditFields}
              multiline
            />

            <View style={styles.moreSeparator} />

            {/* Yield test — solo si NO archivado. No tiene sentido medir
                rendimiento de un producto fuera de circulación. */}
            {canEditFields ? (
              showYieldForm ? (
                <View style={styles.yieldWrapper}>
                  <YieldTestForm
                    productId={product.id}
                    prominent={false}
                    labels={{
                      title: t("yield_form_title"),
                      prominentWarning: "",
                      pesoBrutoLabel: t("yield_form_peso_bruto_label"),
                      pesoUtilLabel: t("yield_form_peso_util_label"),
                      notasLabel: t("yield_form_notas_label"),
                      notasPlaceholder: t("yield_form_notas_placeholder"),
                      mermaPreviewLabel: t("yield_form_merma_preview"),
                      saveLabel: t("yield_form_save"),
                      errorPesoUtilExcedeBruto: t("yield_form_error_util_excede_bruto"),
                      errorInvalid: t("yield_form_error_invalid"),
                    }}
                    onSuccess={(p) => {
                      setProduct(p);
                      void reload();
                      setShowYieldForm(false);
                    }}
                  />
                </View>
              ) : (
                <Pressable
                  style={styles.moreAction}
                  onPress={() => setShowYieldForm(true)}
                >
                  <Ionicons name="flask-outline" size={14} color={colors.inkSoft} />
                  <Text style={styles.moreActionLabel}>{t("yield_advanced_toggle")}</Text>
                </Pressable>
              )
            ) : null}

            {/* Histórico de precios — colapsado por defecto */}
            <Pressable
              style={styles.moreAction}
              onPress={() => setShowPriceHistory((v) => !v)}
            >
              <Ionicons
                name={showPriceHistory ? "chevron-down" : "chevron-forward"}
                size={12}
                color={colors.inkSoft}
              />
              <Ionicons
                name="document-text-outline"
                size={14}
                color={colors.inkSoft}
              />
              <Text style={styles.moreActionLabel}>
                {t("producto_price_history_label")}
              </Text>
            </Pressable>
            {showPriceHistory ? (
              <View style={styles.historyWrapper}>
                {!history || history.priceHistory.length === 0 ? (
                  <Text style={styles.muted}>{t("producto_no_price_history")}</Text>
                ) : (
                  history.priceHistory.map((row) => (
                    <View key={row.id} style={styles.historyRow}>
                      <Text style={styles.historyDate}>
                        {new Date(row.createdAt).toLocaleDateString(dateLocale(lang))}
                      </Text>
                      <Text style={styles.historyValue}>
                        {(row.precio / 100).toFixed(2)} € / {UNIT_SHORT[row.unidadCompra]}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}

            {/* Archivar / Reactivar — ambas pasan por ConfirmSheet ahora.
                Antes el unarchive era directo sin confirmación. */}
            {canEdit ? (
              <Pressable
                style={styles.moreAction}
                onPress={() =>
                  isArchived
                    ? setUnarchivePending(true)
                    : setArchivePending(true)
                }
              >
                <Ionicons
                  name={isArchived ? "archive" : "archive-outline"}
                  size={14}
                  color={colors.inkSoft}
                />
                <Text style={styles.moreActionLabel}>
                  {isArchived ? t("btn_desarchivar") : t("btn_archivar")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* ConfirmSheet de archivar — usa el conteo si > 0 para advertir
          al chef sobre el impacto en recetas que ya usan el producto. */}
      <ConfirmSheet
        open={archivePending}
        title={t("confirm_archive_producto_title")}
        body={
          product.recipesUsingCount > 0
            ? t("confirm_archive_producto_body_with_count", {
                count: product.recipesUsingCount,
              })
            : t("confirm_archive_producto_body")
        }
        confirmLabel={t("btn_archivar")}
        cancelLabel={t("confirm_cancel")}
        destructive
        onConfirm={() => {
          setArchivePending(false);
          void handleArchiveToggle();
        }}
        onCancel={() => setArchivePending(false)}
      />

      {/* ConfirmSheet de desarchivar — texto distinto y no destructivo. */}
      <ConfirmSheet
        open={unarchivePending}
        title={t("confirm_unarchive_producto_title")}
        body={t("confirm_unarchive_producto_body")}
        confirmLabel={t("btn_desarchivar")}
        cancelLabel={t("confirm_cancel")}
        onConfirm={() => {
          setUnarchivePending(false);
          void handleArchiveToggle();
        }}
        onCancel={() => setUnarchivePending(false)}
      />

      {/* Sheets de categoría y unidad (sub-paso 2b). Solo se abren cuando
          el chef toca el campo en "Más opciones" y el producto no está
          archivado — la lógica de canEditFields en FieldTappable bloquea
          el setX...SheetOpen(true) en ese caso. */}
      <ChoiceSheet
        open={categorySheetOpen}
        title={t("producto_form_category_label")}
        options={categoryOptions}
        current={product.category}
        onSelect={(v) => void handleSaveCategory(v)}
        onCancel={() => setCategorySheetOpen(false)}
      />
      <ChoiceSheet
        open={unitSheetOpen}
        title={t("producto_form_unidad_label")}
        options={unitOptions}
        current={product.unidadCompra}
        onSelect={(v) => void handleSaveUnit(v)}
        onCancel={() => setUnitSheetOpen(false)}
      />
    </Screen>
  );
}

// Campo read-only en "Más opciones" — etiqueta arriba, valor abajo.
function FieldReadonly({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldBlockLabel}>{label}</Text>
      <Text style={styles.fieldBlockValue}>{value}</Text>
    </View>
  );
}

// Campo de texto editable inline (DebouncedTextInput) en "Más opciones".
// Auto-save on blur. Si el caller pasa onSave que tira, mostramos toast
// pero no recuperamos el input (limitación de DebouncedTextInput, que no
// expone status). Para el usecase de pezzatura/proveedor/notas es OK.
function FieldEditable({
  label,
  value,
  placeholder,
  onSave,
  editable,
  multiline,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (next: string) => void;
  editable: boolean;
  multiline?: boolean;
}) {
  if (!editable) {
    return <FieldReadonly label={label} value={value || "—"} />;
  }
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldBlockLabel}>{label}</Text>
      <DebouncedTextInput
        value={value}
        onSave={onSave}
        placeholder={placeholder}
        style={[
          styles.fieldEditableInput,
          multiline ? styles.fieldEditableMulti : null,
        ]}
        multiline={multiline}
        maxLength={multiline ? 2000 : 200}
      />
    </View>
  );
}

// Tap → abre un ChoiceSheet (sub-paso 2b). Si !editable, cae a Readonly.
// El chevron indica "tappable", se oculta cuando readonly para no engañar.
function FieldTappable({
  label,
  value,
  editable,
  onTap,
}: {
  label: string;
  value: string;
  editable: boolean;
  onTap: () => void;
}) {
  if (!editable) {
    return <FieldReadonly label={label} value={value} />;
  }
  return (
    <Pressable style={styles.fieldBlock} onPress={onTap}>
      <Text style={styles.fieldBlockLabel}>{label}</Text>
      <View style={styles.fieldTappableRow}>
        <Text style={styles.fieldBlockValue}>{value}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.mute} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.mute },

  heroBlock: { gap: 4 },
  heroName: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  heroNameInput: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    padding: 0,
  },
  subRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  subText: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  archivedTag: { color: colors.terracota, fontWeight: "600" },

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
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifXl,
    color: colors.ink,
  },
  bigStatUnit: { fontSize: fontSizes.bodySm, color: colors.mute },

  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
  },
  fieldLabel: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft },
  fieldValueGroup: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  unitHint: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },

  priceOldHint: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    fontStyle: "italic",
  },

  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  moreLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.inkSoft,
    fontWeight: "600",
  },
  moreContent: { gap: spacing.md },
  moreSeparator: {
    height: 0.5,
    backgroundColor: colors.edge,
    marginVertical: spacing.xs,
  },

  fieldBlock: { gap: 4 },
  fieldBlockLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  fieldBlockValue: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  fieldEditableInput: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    paddingHorizontal: 0,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.edge,
  },
  fieldEditableMulti: { minHeight: 48, textAlignVertical: "top" },
  fieldTappableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.edge,
  },

  moreAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  moreActionLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
  },

  yieldWrapper: { marginTop: -spacing.xs },
  historyWrapper: { paddingLeft: spacing.lg, gap: spacing.xs, marginTop: -spacing.xs },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  historyDate: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  historyValue: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.ink },
  muted: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute, paddingLeft: spacing.lg },
});
