// Vista cliente — la sheet de previsualización antes de exportar el PDF.
//
// Mejora 3: TODA la edición acá pega a la tabla `MenuClientOverride` vía
// `patchClientOverrides`, NO a `MenuItem` / `MenuFolder` / `Restaurant`. Por
// eso lo que toques acá no afecta a la versión staff del compositor ni a la
// receta original.
//
// Cada campo muestra `override ?? valor canónico del staff`. Si el chef
// vuelve a tipear el valor staff (o lo deja vacío), la entrada se borra del
// JSON de overrides y el PDF cliente vuelve al fallback automático.
//
// La sheet ya no permite agregar/eliminar secciones ni platos — esa
// estructura vive en el compositor staff. Acá sólo se afina el texto y los
// precios visibles para el comensal.

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { patchClientOverrides, patchMenu, type MenuFull, type ClientOverrides } from "@/src/api/menus";
import { patchRestaurant } from "@/src/api/auth";
import { DebouncedTextInput } from "./DebouncedTextInput";
import { showToast } from "./Toast";
import { Button } from "./Button";
import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "./BottomSheet";
import { AllergenIcon } from "./AllergenIcon";
import { MenuAllergenPickerSheet } from "./MenuAllergenPickerSheet";
import { patchRecipe } from "@/src/api/recipes";
import { ALLERGEN_ORDER, type Allergen } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import { apiErrorMessage } from "@/src/lib/api-error";

function centsFromInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9.,]/g, "").replace(",", ".");
  const n = parseFloat(cleaned || "0");
  return Math.max(0, Math.round(n * 100));
}

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(0);
}

/**
 * Sets `current[key] = value` unless the value equals `canonical` or is
 * empty/undefined, in which case it deletes the key. Used at the top level
 * (restaurantName, menuName, subtitle).
 */
function withTop(
  current: ClientOverrides,
  key: "restaurantName" | "menuName" | "subtitle",
  value: string | undefined,
  canonical: string,
): ClientOverrides {
  const next = { ...current };
  if (value === undefined || value === "" || value === canonical) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

/** Same but for nested `items[id].{field}` / `sections[id].{field}`. */
function withNested<TInner extends Record<string, string | number | undefined>>(
  current: ClientOverrides,
  bag: "items" | "sections",
  id: string,
  field: keyof TInner,
  value: TInner[keyof TInner] | undefined,
  canonical: TInner[keyof TInner],
): ClientOverrides {
  const next = { ...current };
  const sub = { ...((next[bag] ?? {}) as Record<string, TInner>) };
  const entry = { ...(sub[id] ?? ({} as TInner)) };
  if (value === undefined || value === "" || value === canonical) {
    delete entry[field];
  } else {
    entry[field] = value;
  }
  if (Object.keys(entry).length === 0) {
    delete sub[id];
  } else {
    sub[id] = entry;
  }
  if (Object.keys(sub).length === 0) {
    delete next[bag];
  } else {
    (next as Record<string, unknown>)[bag] = sub;
  }
  return next;
}

type Props = {
  open: boolean;
  menu: MenuFull;
  exporting: boolean;
  canEdit: boolean;
  onClose: () => void;
  onDownload: () => void;
  onChanged: () => void; // padre debe recargar el menú tras el PATCH
};

export function ExportPreviewSheet({
  open,
  menu,
  exporting,
  canEdit,
  onClose,
  onDownload,
  onChanged,
}: Props) {
  const { t } = useI18n();
  const { state: authState, patchLocalUser } = useAuth();
  // Fase 2 alérgenos — qué plato abrió el "+" para agregar manual. Guardamos
  // solo el ID (no el snapshot) para que el sheet del picker refleje los
  // updates optimistas del estado local.
  const [pickerDishId, setPickerDishId] = useState<string | null>(null);
  // Optimistic overrides de manualAllergens por recipeId. Se aplica
  // inmediatamente al confirmar el PATCH (add/remove) sin esperar al
  // re-fetch del menú. Si el PATCH falla, se revierte. Se limpia cuando el
  // sheet exterior se cierra (los datos del menu prop ya están actualizados
  // por el silent reload en ese momento).
  const [manualOverrides, setManualOverrides] = useState<Record<string, Allergen[]>>({});

  // Helpers: derivan el estado efectivo de un plato combinando el snapshot
  // del server (menu prop) con los overrides locales pendientes.
  function getEffectiveManual(d: MenuFull["items"][number]): Allergen[] {
    return manualOverrides[d.recipeId] ?? d.manualAllergens;
  }
  function getEffectiveAllergens(d: MenuFull["items"][number]): Allergen[] {
    // Sin override local → el server ya tiene la verdad (allergens completo).
    if (manualOverrides[d.recipeId] === undefined) return d.allergens;
    // Con override local: heredados (del server) + manuales locales, dedup en
    // orden EU 1169. Heredados = allergens del server - manualAllergens del
    // server (la diferencia es lo que viene de productos enlazados).
    const serverManual = new Set(d.manualAllergens);
    const inherited = d.allergens.filter((a) => !serverManual.has(a));
    const union = new Set<Allergen>([...inherited, ...manualOverrides[d.recipeId]]);
    return ALLERGEN_ORDER.filter((a) => union.has(a));
  }

  async function handleAddManualAllergen(d: MenuFull["items"][number], allergen: Allergen) {
    const currentManual = getEffectiveManual(d);
    if (currentManual.includes(allergen)) return; // ya está, no-op.
    // Optimistic update: el sheet y la preview reflejan el cambio YA.
    const nextManual: Allergen[] = [...currentManual, allergen];
    setManualOverrides((prev) => ({ ...prev, [d.recipeId]: nextManual }));
    try {
      await patchRecipe(d.recipeId, { addManualAllergen: allergen });
      // Reconciliación silenciosa: el padre re-fetchea, el menu prop refresca,
      // y el override local sigue siendo consistente con el server.
      onChanged();
    } catch (err) {
      // Revert: volvemos a la lista anterior (si existía override) o salimos
      // del override (volvemos al snapshot del server).
      setManualOverrides((prev) => ({ ...prev, [d.recipeId]: currentManual }));
      showToast(apiErrorMessage(err, t));
    }
  }
  async function handleRemoveManualAllergen(d: MenuFull["items"][number], allergen: Allergen) {
    const currentManual = getEffectiveManual(d);
    if (!currentManual.includes(allergen)) return; // no estaba, no-op.
    const nextManual = currentManual.filter((a) => a !== allergen);
    setManualOverrides((prev) => ({ ...prev, [d.recipeId]: nextManual }));
    try {
      await patchRecipe(d.recipeId, { removeManualAllergen: allergen });
      onChanged();
    } catch (err) {
      setManualOverrides((prev) => ({ ...prev, [d.recipeId]: currentManual }));
      showToast(apiErrorMessage(err, t));
    }
  }

  // Limpia overrides cuando el sheet exterior se cierra. En el próximo open,
  // el menu prop ya viene reconciliado del padre (silent reload), así que
  // partimos limpio.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current && !open) {
      setManualOverrides({});
      setPickerDishId(null);
    }
    prevOpenRef.current = open;
  }, [open]);
  async function handleToggleAllergens(next: boolean) {
    try {
      await patchMenu(menu.id, { showAllergensInPdf: next });
      onChanged();
    } catch (err) {
      showToast(apiErrorMessage(err, t));
    }
  }
  // WYSIWYG: si toggle OFF, ni iconos por plato ni leyenda al pie. El "+"
  // tampoco aparece — si el chef apaga el toggle es porque NO va a mostrar
  // alérgenos en este menú.
  const showAllergens = menu.showAllergensInPdf;

  const canonicalRestaurantName =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.restaurantName ?? ""
      : "";

  const overrides: ClientOverrides = menu.clientOverrides ?? {};

  // Display values: override > canonical (staff). El compositor staff lee
  // los canonical (MenuItem.customName, etc), por eso jamás ve estos cambios.
  const restaurantNameDisp = overrides.restaurantName ?? canonicalRestaurantName;
  const menuNameDisp = overrides.menuName ?? menu.name;

  async function saveOverrides(next: ClientOverrides) {
    try {
      await patchClientOverrides(menu.id, next);
      onChanged();
    } catch (err) {
      showToast(apiErrorMessage(err, t));
    }
  }

  // Caso especial: el nombre del restaurante PISA Restaurant.name (admin),
  // no `clientOverrides`. Eso preserva la semántica "es el restaurante" —
  // pero NO hacemos refreshMe (round-trip extra), mutamos el state local de
  // useAuth con el nuevo nombre que ya pegamos al server.
  async function onSaveRestaurantName(v: string) {
    const cleaned = v.trim();
    if (!cleaned || cleaned === canonicalRestaurantName) return;
    try {
      await patchRestaurant({ name: cleaned });
      patchLocalUser({ restaurantName: cleaned });
    } catch (err) {
      showToast(apiErrorMessage(err, t));
    }
  }

  const onSaveMenuName = (v: string) =>
    void saveOverrides(withTop(overrides, "menuName", v, menu.name));

  const onSaveSectionName = (sectionId: string, canonicalName: string, v: string) =>
    void saveOverrides(
      withNested<{ name: string | undefined }>(
        overrides,
        "sections",
        sectionId,
        "name",
        v,
        canonicalName,
      ),
    );

  const onSaveItemName = (itemId: string, canonical: string, v: string) =>
    void saveOverrides(
      withNested<{ name: string | undefined; description: string | undefined; price: number | undefined }>(
        overrides,
        "items",
        itemId,
        "name",
        v,
        canonical,
      ),
    );
  const onSaveItemDesc = (itemId: string, canonical: string, v: string) =>
    void saveOverrides(
      withNested<{ name: string | undefined; description: string | undefined; price: number | undefined }>(
        overrides,
        "items",
        itemId,
        "description",
        v,
        canonical,
      ),
    );
  const onSaveItemPrice = (itemId: string, canonical: number, v: string) =>
    void saveOverrides(
      withNested<{ name: string | undefined; description: string | undefined; price: number | undefined }>(
        overrides,
        "items",
        itemId,
        "price",
        centsFromInput(v),
        canonical,
      ),
    );

  // Group dishes by section. Items con sectionId === null van al final como
  // "unsectioned" (sin header). No mostramos botones de agregar/eliminar
  // sección — eso vive en el staff.
  const sectionsSorted = [...(menu.sections ?? [])].sort((a, b) => a.order - b.order);
  const itemsBySection = new Map<string | null, MenuFull["items"]>();
  for (const it of menu.items) {
    const key = it.sectionId ?? null;
    if (!itemsBySection.has(key)) itemsBySection.set(key, []);
    itemsBySection.get(key)!.push(it);
  }
  const unsectionedItems = itemsBySection.get(null) ?? [];

  // Fase 2 alérgenos — unión de todos los alérgenos efectivos (server +
  // overrides locales) del menú, ordenada Reg. EU 1169. Si vacía, la leyenda
  // al pie no se renderiza. Coherencia: misma fuente que los iconos por plato.
  const menuAllergens: Allergen[] = ALLERGEN_ORDER.filter((a) =>
    menu.items.some((it) => getEffectiveAllergens(it).includes(a)),
  );

  // Derivar el plato del picker desde menu.items + overrides cada render —
  // así el sheet refleja los updates optimistas al instante.
  const pickerDish = pickerDishId
    ? menu.items.find((it) => it.id === pickerDishId) ?? null
    : null;

  return (
    <>
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.previewBox} keyboardShouldPersistTaps="handled">
        {/* Fase 2 alérgenos — toggle global del PDF cliente. ON por default.
            WYSIWYG: si OFF, el preview no muestra iconos ni leyenda (refleja
            lo que verá el cliente en el PDF). */}
        {canEdit ? (
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("menu_show_allergens_toggle")}</Text>
            <Switch
              value={showAllergens}
              onValueChange={(v) => void handleToggleAllergens(v)}
              trackColor={{ false: colors.edge, true: colors.teal }}
              thumbColor={colors.paper}
            />
          </View>
        ) : null}

        <DebouncedTextInput
          value={restaurantNameDisp}
          onSave={onSaveRestaurantName}
          style={styles.restaurantName}
          editable={canEdit}
          placeholder={t("profile_restaurant")}
          maxLength={100}
        />

        <DebouncedTextInput
          value={menuNameDisp}
          onSave={onSaveMenuName}
          style={styles.menuName}
          editable={canEdit}
          placeholder={t("recetas_form_title_placeholder")}
          multiline
          maxLength={120}
        />

        {sectionsSorted.map((sec) => {
          const items = itemsBySection.get(sec.id) ?? [];
          const sectionNameDisp = overrides.sections?.[sec.id]?.name ?? sec.name;
          return (
            <View key={sec.id} style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <DebouncedTextInput
                  value={sectionNameDisp}
                  onSave={(v) => onSaveSectionName(sec.id, sec.name, v)}
                  style={styles.sectionName}
                  editable={canEdit}
                  placeholder={t("section_name_placeholder")}
                  maxLength={120}
                />
              </View>
              {items.map((d) => {
                const o = overrides.items?.[d.id];
                return (
                  <DishRow
                    key={d.id}
                    nameDisp={o?.name ?? d.name}
                    descDisp={o?.description ?? d.description}
                    priceDisp={o?.price ?? d.price}
                    allergens={getEffectiveAllergens(d)}
                    canEdit={canEdit}
                    showAllergens={showAllergens}
                    onAddAllergenPress={() => setPickerDishId(d.id)}
                    onSaveName={(v) => onSaveItemName(d.id, d.name, v)}
                    onSaveDesc={(v) => onSaveItemDesc(d.id, d.description, v)}
                    onSavePrice={(v) => onSaveItemPrice(d.id, d.price, v)}
                  />
                );
              })}
            </View>
          );
        })}

        {unsectionedItems.length > 0 ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionNameMute}>{t("section_unassigned")}</Text>
            {unsectionedItems.map((d) => {
              const o = overrides.items?.[d.id];
              return (
                <DishRow
                  key={d.id}
                  nameDisp={o?.name ?? d.name}
                  descDisp={o?.description ?? d.description}
                  priceDisp={o?.price ?? d.price}
                  allergens={getEffectiveAllergens(d)}
                  canEdit={canEdit}
                  showAllergens={showAllergens}
                  onAddAllergenPress={() => setPickerDishId(d.id)}
                  onSaveName={(v) => onSaveItemName(d.id, d.name, v)}
                  onSaveDesc={(v) => onSaveItemDesc(d.id, d.description, v)}
                  onSavePrice={(v) => onSaveItemPrice(d.id, d.price, v)}
                />
              );
            })}
          </View>
        ) : null}

        {showAllergens && menuAllergens.length > 0 ? (
          <View style={styles.allergenLegend}>
            <Text style={styles.allergenLegendTitle}>
              {t("menu_allergen_legend_title")}
            </Text>
            <View style={styles.allergenLegendList}>
              {menuAllergens.map((a) => (
                <View key={a} style={styles.allergenLegendItem}>
                  <AllergenIcon allergen={a} size={13} />
                  <Text style={styles.allergenLegendLabel}>
                    {t(`allergen_${a}` as const)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={exporting ? "…" : t("export_preview_download")}
          iconLeft="download-outline"
          onPress={onDownload}
          disabled={exporting || menu.items.length === 0}
        />
      </View>
    </BottomSheet>

    {/* Fase 2 alérgenos — Modal sibling al outer BottomSheet (NO anidado).
        Antes vivía dentro del BottomSheet padre y los Modals anidados en RN
        no se rendereaban encima — el sheet abría invisible y los taps caían
        al outer. Como sibling Fragment ambos Modals coexisten correctamente. */}
    <MenuAllergenPickerSheet
      open={pickerDish !== null}
      recipeName={pickerDish?.name ?? ""}
      // Effective: derivado de menu + overrides locales en cada render. Así
      // tras un add/remove optimistic, el chip refleja el cambio al instante
      // (sin esperar al re-fetch). Y por la misma razón, un mismo manual
      // tappeado dos veces no rebota — el segundo tap ve que ya no está y
      // es no-op.
      allergens={pickerDish ? getEffectiveAllergens(pickerDish) : []}
      manualAllergens={pickerDish ? getEffectiveManual(pickerDish) : []}
      onAdd={(a) => {
        if (pickerDish) void handleAddManualAllergen(pickerDish, a);
      }}
      onRemove={(a) => {
        if (pickerDish) void handleRemoveManualAllergen(pickerDish, a);
      }}
      onClose={() => setPickerDishId(null)}
    />
    </>
  );
}

function DishRow({
  nameDisp,
  descDisp,
  priceDisp,
  allergens,
  canEdit,
  showAllergens,
  onAddAllergenPress,
  onSaveName,
  onSaveDesc,
  onSavePrice,
}: {
  nameDisp: string;
  descDisp: string;
  priceDisp: number;
  allergens: Allergen[];
  canEdit: boolean;
  // WYSIWYG con el toggle global del menú. Si false, ni iconos ni "+".
  showAllergens: boolean;
  onAddAllergenPress: () => void;
  onSaveName: (v: string) => void;
  onSaveDesc: (v: string) => void;
  onSavePrice: (v: string) => void;
}) {
  const { t } = useI18n();
  // Bloque 5 — layout centrado (mockup): nombre serif italic, descripción
  // chiquita debajo, precio terracota abajo. Edición inline conservada.
  //
  // Fase 2 alérgenos — fila de iconos en gris bajo el precio, solo si la
  // receta hereda o tiene alérgenos manuales. Sin label, sin badge: el icono
  // basta. Iconos NO tappeables (el "+" de Sub-fase 2B será el único punto
  // de interacción, para evitar tap accidental).
  return (
    <View style={styles.dishRow}>
      <DebouncedTextInput
        value={nameDisp}
        onSave={onSaveName}
        style={styles.dishName}
        editable={canEdit}
        placeholder={t("recetas_form_title_placeholder")}
        multiline
        maxLength={200}
      />
      {descDisp || canEdit ? (
        <DebouncedTextInput
          value={descDisp}
          onSave={onSaveDesc}
          style={styles.dishDesc}
          editable={canEdit}
          placeholder={t("recetas_form_notes_placeholder")}
          multiline
          maxLength={1000}
        />
      ) : null}
      <View style={styles.priceBox}>
        <DebouncedTextInput
          value={formatPrice(priceDisp)}
          onSave={onSavePrice}
          style={styles.dishPrice}
          editable={canEdit}
          keyboardType="numeric"
          placeholder="0"
          maxLength={10}
        />
        <Text style={styles.priceUnit}>€</Text>
      </View>
      {showAllergens && (allergens.length > 0 || canEdit) ? (
        <View style={styles.dishAllergens}>
          {allergens.map((a) => (
            <AllergenIcon key={a} allergen={a} size={16} />
          ))}
          {canEdit ? (
            <Pressable
              style={styles.addAllergenBtn}
              onPress={onAddAllergenPress}
              accessibilityLabel="Añadir alérgeno"
            >
              <Ionicons name="add" size={12} color={colors.mute} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Bloque 5 — restyle editorial del preview (mockup imagen 1): todo
  // centrado, serif italic más grande, separadores hairline, espaciados
  // generosos. Solo visual — la edición inline y los overrides quedan igual.
  previewBox: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  restaurantName: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    textAlign: "center",
    lineHeight: fontSizes.serifLg * 1.2,
  },
  menuName: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
  sectionBlock: { gap: spacing.xs, marginTop: spacing.lg },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionName: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.terracota,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontWeight: "600",
    textAlign: "center",
  },
  sectionNameMute: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontWeight: "600",
    textAlign: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  dishRow: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edgeSoft,
  },
  dishName: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodyLg,
    color: colors.ink,
    textAlign: "center",
    lineHeight: fontSizes.bodyLg * 1.3,
  },
  dishDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    marginTop: 2,
    lineHeight: fontSizes.bodySm * 1.4,
    textAlign: "center",
  },
  priceBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    marginTop: 2,
  },
  dishPrice: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodyLg,
    color: colors.terracota,
    fontWeight: "600",
    textAlign: "center",
  },
  priceUnit: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
  },
  // Fase 2 alérgenos — fila de iconos bajo el precio (mockup imagen 1).
  dishAllergens: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
    marginTop: 10,
  },
  // Toggle row arriba del preview — "Mostrar alérgenos en la carta".
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
  },
  toggleLabel: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.ink,
    fontWeight: "500",
  },
  // Botón "+" sutil al lado de los iconos, círculo punteado (mockup imagen 1).
  addAllergenBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 0.5,
    borderStyle: "dashed",
    borderColor: colors.edge,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
    backgroundColor: "transparent",
  },
  // Leyenda al pie del menú: bloque suave centrado con eyebrow + chips
  // ícono+texto. Solo se renderea si hay al menos 1 alérgeno en el menú.
  allergenLegend: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.paperSoft,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
  },
  allergenLegendTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    letterSpacing: 1.6,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  allergenLegendList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  allergenLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  allergenLegendLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.inkSoft,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
});
