// Wizard "Añadir receta a menú".
//
// Steps:
//  1. "menu-list"    — listar menús + CTA crear menú nuevo
//  2. "create-menu"  — form nombre + season para crear menú nuevo
//  3. "section-list" — listar secciones del menú elegido + "Sin sección" +
//                      CTA crear sección nueva
//  4. "create-section" — preset chips (Antipasti freddi, etc.) o nombre custom
//
// El item se persiste en el paso 3 o 4, con sectionId apropiado. Si el chef
// crea un menú nuevo, automáticamente avanza al paso 3 (el menú está vacío).

import { useEffect, useState } from "react";
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
import { useI18n } from "@/src/hooks/useI18n";
import {
  listMenus,
  getMenu,
  createMenu,
  addMenuItem,
  createSection,
  type Menu,
  type MenuFull,
} from "@/src/api/menus";
import { showToast } from "./Toast";
import { Button } from "./Button";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  recipeId: string;
  onClose: () => void;
};

type Step = "menu-list" | "create-menu" | "section-list" | "create-section";

const DEFAULT_PRICE_CENTS = 2800;

// Presets de sección — términos italianos clásicos, no se traducen.
const SECTION_PRESETS: ReadonlyArray<string> = [
  "Antipasti freddi",
  "Antipasti caldi",
  "Primi piatti",
  "Secondi di mare",
  "Secondi di terra",
  "Contorni",
  "Pre-dessert",
  "Dolci",
  "Piccola pasticceria",
];

export function AddToMenuSheet({ open, recipeId, onClose }: Props) {
  const { t } = useI18n();

  const [step, setStep] = useState<Step>("menu-list");
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loadingMenus, setLoadingMenus] = useState(false);

  const [selectedMenu, setSelectedMenu] = useState<MenuFull | null>(null);
  const [loadingMenu, setLoadingMenu] = useState(false);

  // Estados de creación.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSeason, setNewSeason] = useState("");
  const [customSectionName, setCustomSectionName] = useState("");

  // Reset cuando se abre.
  useEffect(() => {
    if (!open) return;
    setStep("menu-list");
    setSelectedMenu(null);
    setNewName("");
    setNewSeason("");
    setCustomSectionName("");
    setLoadingMenus(true);
    listMenus()
      .then(setMenus)
      .catch(() => setMenus([]))
      .finally(() => setLoadingMenus(false));
  }, [open]);

  // ─────────── Step transitions ───────────

  async function goToSectionStepForMenu(menuId: string) {
    setLoadingMenu(true);
    try {
      const full = await getMenu(menuId);
      setSelectedMenu(full);
      setStep("section-list");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setLoadingMenu(false);
    }
  }

  function backToMenuList() {
    setStep("menu-list");
    setSelectedMenu(null);
    setNewName("");
    setNewSeason("");
  }

  function backToSectionList() {
    setStep("section-list");
    setCustomSectionName("");
  }

  // ─────────── Add actions ───────────

  async function addToSection(menuId: string, sectionId: string | null) {
    try {
      await addMenuItem(menuId, {
        recipeId,
        sectionId,
        price: DEFAULT_PRICE_CENTS,
      });
      showToast(t("toast_added_to_menu"));
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  async function createMenuAndAdvance() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const menu = await createMenu({
        name: newName.trim(),
        season: newSeason.trim() || undefined,
      });
      // No agregamos directamente: forzamos al usuario a elegir sección
      // para mantener la consistencia del wizard. Ese menú está vacío así
      // que el paso 3 le mostrará "Sin sección" + "Crear sección".
      const full = await getMenu(menu.id);
      setSelectedMenu(full);
      setStep("section-list");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setCreating(false);
    }
  }

  async function createSectionAndAdd(name: string) {
    if (!selectedMenu || creating) return;
    const cleaned = name.trim();
    if (!cleaned) return;
    setCreating(true);
    try {
      const updated = await createSection(selectedMenu.id, { name: cleaned });
      // updated.sections incluye la nueva; encontrar su id.
      const newSection = updated.sections.find((s) => s.name === cleaned);
      const targetSectionId = newSection?.id ?? null;
      await addMenuItem(selectedMenu.id, {
        recipeId,
        sectionId: targetSectionId,
        price: DEFAULT_PRICE_CENTS,
      });
      showToast(t("toast_added_to_menu"));
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
      setCreating(false);
    }
  }

  // ─────────── Render ───────────

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Header con título según paso, y back arrow si no estamos en root */}
      <View style={styles.header}>
          {step !== "menu-list" ? (
            <Pressable
              hitSlop={10}
              onPress={
                step === "create-menu"
                  ? backToMenuList
                  : step === "create-section"
                    ? backToSectionList
                    : backToMenuList
              }
              style={styles.back}
            >
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
          ) : null}
          <Text style={styles.title}>
            {step === "menu-list"
              ? t("btn_add_to_menu")
              : step === "create-menu"
                ? t("btn_crear_menu")
                : step === "section-list"
                  ? selectedMenu?.name ?? t("add_to_menu_section_step")
                  : t("section_add")}
          </Text>
        </View>

        {step === "menu-list" ? (
          <ScrollView contentContainerStyle={styles.list}>
            {loadingMenus ? (
              <ActivityIndicator color={colors.terracota} />
            ) : (
              <>
                {menus.map((m) => (
                  <Pressable
                    key={m.id}
                    style={styles.menuRow}
                    onPress={() => void goToSectionStepForMenu(m.id)}
                    disabled={loadingMenu}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuName}>{m.name}</Text>
                      {m.season ? <Text style={styles.menuMeta}>{m.season}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.mute} />
                  </Pressable>
                ))}
                <Pressable style={styles.createRow} onPress={() => setStep("create-menu")}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.terracota} />
                  <Text style={styles.createLabel}>{t("btn_crear_menu")}</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        ) : null}

        {step === "create-menu" ? (
          <View style={styles.createBox}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder={t("onboard_create_name_label")}
              placeholderTextColor={colors.mute}
              style={styles.input}
              maxLength={120}
              autoFocus
            />
            <TextInput
              value={newSeason}
              onChangeText={setNewSeason}
              placeholder={t("add_to_menu_season_placeholder")}
              placeholderTextColor={colors.mute}
              style={styles.input}
              maxLength={60}
            />
            <View style={styles.createActions}>
              <Button
                label={t("confirm_cancel")}
                variant="ghost"
                onPress={backToMenuList}
                disabled={creating}
              />
              <Button
                label={creating ? "…" : t("btn_crear_menu")}
                disabled={!newName.trim() || creating}
                onPress={createMenuAndAdvance}
              />
            </View>
          </View>
        ) : null}

        {step === "section-list" && selectedMenu ? (
          <ScrollView contentContainerStyle={styles.list}>
            <Text style={styles.subtitle}>{t("add_to_menu_section_step")}</Text>
            {selectedMenu.sections
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.menuRow}
                  onPress={() => void addToSection(selectedMenu.id, s.id)}
                  disabled={adding}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuName}>{s.name}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mute} />
                </Pressable>
              ))}
            <Pressable
              style={[styles.menuRow, styles.menuRowMute]}
              onPress={() => void addToSection(selectedMenu.id, null)}
              disabled={adding}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.menuNameMute}>{t("section_unassigned")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mute} />
            </Pressable>
            <Pressable style={styles.createRow} onPress={() => setStep("create-section")}>
              <Ionicons name="add-circle-outline" size={18} color={colors.terracota} />
              <Text style={styles.createLabel}>{t("section_add")}</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        {step === "create-section" ? (
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            <View style={styles.presetGrid}>
              {SECTION_PRESETS.map((name) => (
                <Pressable
                  key={name}
                  style={styles.presetChip}
                  onPress={() => void createSectionAndAdd(name)}
                  disabled={creating}
                >
                  <Text style={styles.presetChipLabel}>{name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.customRow}>
              <TextInput
                value={customSectionName}
                onChangeText={setCustomSectionName}
                placeholder={t("section_name_placeholder")}
                placeholderTextColor={colors.mute}
                style={styles.customInput}
                returnKeyType="done"
                onSubmitEditing={() => void createSectionAndAdd(customSectionName)}
                editable={!creating}
                maxLength={120}
              />
              <Pressable
                onPress={() => void createSectionAndAdd(customSectionName)}
                disabled={!customSectionName.trim() || creating}
                style={[
                  styles.customBtn,
                  (!customSectionName.trim() || creating) && styles.customBtnDisabled,
                ]}
                hitSlop={8}
              >
                <Ionicons name="add" size={18} color={colors.paper} />
              </Pressable>
            </View>
          </ScrollView>
        ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  back: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    flex: 1,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  list: { paddingHorizontal: spacing.xl, gap: spacing.xs, paddingBottom: spacing.xl },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
  },
  menuRowMute: { backgroundColor: colors.paperWarm },
  menuName: { fontFamily: fonts.serifItalic, fontSize: fontSizes.serifBody, color: colors.ink },
  menuNameMute: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.mute,
    fontStyle: "italic",
  },
  menuMeta: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute, marginTop: 2 },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.terracota,
    marginTop: spacing.sm,
  },
  createLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.terracota,
    fontWeight: "600",
  },
  createBox: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xl },
  input: {
    backgroundColor: colors.paper,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  createActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", marginTop: spacing.sm },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  presetChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.terracota,
    backgroundColor: colors.paperSoft,
  },
  presetChipLabel: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodySm,
    color: colors.terracota,
  },
  customRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  customInput: {
    flex: 1,
    backgroundColor: colors.paper,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  customBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.terracota,
    alignItems: "center",
    justifyContent: "center",
  },
  customBtnDisabled: { opacity: 0.4 },
});
