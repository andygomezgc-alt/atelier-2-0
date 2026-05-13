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
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { patchClientOverrides, type MenuFull, type ClientOverrides } from "@/src/api/menus";
import { patchRestaurant } from "@/src/api/auth";
import { DebouncedTextInput } from "./DebouncedTextInput";
import { showToast } from "./Toast";
import { Button } from "./Button";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

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

  const canonicalRestaurantName =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.restaurantName ?? ""
      : "";

  const overrides: ClientOverrides = menu.clientOverrides ?? {};

  // Display values: override > canonical (staff). El compositor staff lee
  // los canonical (MenuItem.customName, etc), por eso jamás ve estos cambios.
  const restaurantNameDisp = overrides.restaurantName ?? canonicalRestaurantName;
  const menuNameDisp = overrides.menuName ?? menu.name;
  const subtitleDisp = overrides.subtitle ?? (menu.season ?? "");

  async function saveOverrides(next: ClientOverrides) {
    try {
      await patchClientOverrides(menu.id, next);
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
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
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  const onSaveMenuName = (v: string) =>
    void saveOverrides(withTop(overrides, "menuName", v, menu.name));
  const onSaveSubtitle = (v: string) =>
    void saveOverrides(withTop(overrides, "subtitle", v, menu.season ?? ""));

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

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.previewBox} keyboardShouldPersistTaps="handled">
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

        <DebouncedTextInput
          value={subtitleDisp}
          onSave={onSaveSubtitle}
          style={styles.menuSeason}
          editable={canEdit}
          placeholder={t("add_to_menu_season_placeholder")}
          maxLength={60}
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
                    canEdit={canEdit}
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
                  canEdit={canEdit}
                  onSaveName={(v) => onSaveItemName(d.id, d.name, v)}
                  onSaveDesc={(v) => onSaveItemDesc(d.id, d.description, v)}
                  onSavePrice={(v) => onSaveItemPrice(d.id, d.price, v)}
                />
              );
            })}
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
  );
}

function DishRow({
  nameDisp,
  descDisp,
  priceDisp,
  canEdit,
  onSaveName,
  onSaveDesc,
  onSavePrice,
}: {
  nameDisp: string;
  descDisp: string;
  priceDisp: number;
  canEdit: boolean;
  onSaveName: (v: string) => void;
  onSaveDesc: (v: string) => void;
  onSavePrice: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.dishRow}>
      <View style={{ flex: 1 }}>
        <DebouncedTextInput
          value={nameDisp}
          onSave={onSaveName}
          style={styles.dishName}
          editable={canEdit}
          placeholder={t("recetas_form_title_placeholder")}
          multiline
          maxLength={200}
        />
        <DebouncedTextInput
          value={descDisp}
          onSave={onSaveDesc}
          style={styles.dishDesc}
          editable={canEdit}
          placeholder={t("recetas_form_notes_placeholder")}
          multiline
          maxLength={1000}
        />
      </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  previewBox: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  restaurantName: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "600",
  },
  menuName: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifXl,
    color: colors.ink,
    lineHeight: fontSizes.serifXl * 1.15,
  },
  menuSeason: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  sectionBlock: { gap: spacing.xs, marginTop: spacing.md },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionName: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.terracota,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "600",
  },
  sectionNameMute: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "600",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
  dishRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edgeSoft,
  },
  dishName: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  dishDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    marginTop: 2,
    lineHeight: fontSizes.bodySm * 1.4,
  },
  priceBox: { flexDirection: "row", alignItems: "center", gap: 2 },
  dishPrice: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.terracota,
    fontWeight: "600",
    minWidth: 40,
    textAlign: "right",
  },
  priceUnit: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
});
