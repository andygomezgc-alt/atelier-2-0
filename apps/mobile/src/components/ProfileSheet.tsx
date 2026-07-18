import { useEffect, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { patchMe, uploadMePhoto } from "@/src/api/auth";
import { BASE } from "@/src/api/client";
import { apiErrorMessage } from "@/src/lib/api-error";
import { showToast } from "./Toast";
import { BottomSheet } from "./BottomSheet";
import { DeleteAccountSheet } from "./DeleteAccountSheet";
import { LeaveRestaurantSheet } from "./LeaveRestaurantSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import type { Language } from "@atelier/i18n";
import type { Role } from "@atelier/shared";

type Props = { open: boolean; onClose: () => void };

const LANGS: ReadonlyArray<Language> = ["es", "it", "en"];

export function ProfileSheet({ open, onClose }: Props) {
  const { state, signOut, refreshMe } = useAuth();
  const { t, lang, setLang } = useI18n();

  const user =
    state.status === "signed-in" || state.status === "needs-restaurant" ? state.user : null;

  const roleLabel: Record<Role, string> = {
    admin: t("role_admin"),
    chef_executive: t("role_chef_executive"),
    sous_chef: t("role_sous_chef"),
    viewer: t("role_viewer"),
  };

  // Plan del restaurante — etiqueta del tier + sufijo de estado solo cuando el
  // estado NO es "active" (active es lo normal, no hace falta decirlo).
  const planLabel: Record<string, string> = {
    pilot: t("plan_pilot"),
    founder: t("plan_founder"),
    early: t("plan_early"),
    pro: t("plan_pro"),
  };
  const planStatusLabel: Record<string, string> = {
    trial: t("plan_status_trial"),
    past_due: t("plan_status_past_due"),
    canceled: t("plan_status_canceled"),
  };
  const planValue = (() => {
    if (!user) return "";
    const tier = user.plan ? planLabel[user.plan] : "—";
    const status =
      user.planStatus && user.planStatus !== "active"
        ? planStatusLabel[user.planStatus]
        : null;
    return status ? `${tier} · ${status}` : tier;
  })();
  // CTA "Hacete Pro": el checkout Stripe vive en la web. Solo Android (Apple
  // prohíbe linkear a compras externas), solo admin, y no para quien ya paga.
  const showGoPro =
    Platform.OS === "android" &&
    user?.role === "admin" &&
    !(
      (user.plan === "founder" || user.plan === "pro") &&
      user.planStatus === "active"
    );

  async function handleLangChange(l: Language) {
    // P2-11 — antes: `.catch(() => null)`. El idioma se aplicaba en pantalla pero
    // podía no guardarse NUNCA sin avisar. Ahora avisamos y revertimos el
    // optimista si el PATCH falla.
    const prev = lang;
    setLang(l);
    try {
      await patchMe({ languagePref: l });
    } catch (err) {
      setLang(prev);
      showToast(apiErrorMessage(err, t));
    }
  }

  async function handleModelChange(model: "haiku" | "sonnet" | "opus") {
    // P2-11 — antes: `.catch(() => null)`, fallo silencioso total. El modelo
    // visible sale de user.defaultModel (se actualiza con refreshMe), así que si
    // el PATCH falla no hay optimista que revertir: basta avisar.
    try {
      await patchMe({ defaultModel: model });
      await refreshMe();
    } catch (err) {
      showToast(apiErrorMessage(err, t));
    }
  }

  // Edición inline de nombre + bio (icono lápiz). Mismo patrón optimistic
  // que usamos en alérgenos: el override local se aplica al instante, se
  // revierte si el PATCH falla, se limpia cuando refreshMe trae los nuevos.
  const [editing, setEditing] = useState(false);
  // Eliminar cuenta — sheet propio apilado sobre este (patrón StaffMemberSheet
  // + ConfirmSheet: modal hermano, el perfil queda abierto debajo).
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Salir del restaurante — mismo patrón de modal hermano.
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [bioInput, setBioInput] = useState("");
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [bioOverride, setBioOverride] = useState<string | null>(null);

  const displayName = nameOverride ?? user?.name ?? "";
  const displayBio = bioOverride ?? user?.bio ?? null;

  function startEdit() {
    if (!user) return;
    setNameInput(user.name);
    setBioInput(user.bio ?? "");
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
  }
  async function handleSave() {
    const name = nameInput.trim();
    const bio = bioInput.trim();
    if (!name) {
      showToast(t("profile_name_empty_toast"));
      return;
    }
    setNameOverride(name);
    setBioOverride(bio);
    setEditing(false);
    try {
      await patchMe({ name, bio });
      await refreshMe();
      showToast("Guardado");
    } catch (err) {
      setNameOverride(null);
      setBioOverride(null);
      showToast(apiErrorMessage(err, t));
    }
  }

  // Foto de perfil: tap en el círculo → galería → POST /api/me/photo →
  // refreshMe trae el photoUrl nuevo. Mismo flujo de permisos que foto-receta.
  async function handleChangePhoto() {
    if (photoUploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast(t("cargar_permiso_galeria"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setPhotoUploading(true);
    try {
      await uploadMePhoto(asset.uri, asset.mimeType ?? "image/jpeg");
      await refreshMe();
    } catch (err) {
      showToast(apiErrorMessage(err, t));
    } finally {
      setPhotoUploading(false);
    }
  }

  // Cuando refreshMe trae los valores nuevos del server, limpiar overrides.
  useEffect(() => {
    if (!user) return;
    if (nameOverride !== null && user.name === nameOverride) setNameOverride(null);
    if (bioOverride !== null && (user.bio ?? "") === bioOverride) setBioOverride(null);
  }, [user, nameOverride, bioOverride]);

  return (
    <>
      <BottomSheet open={open} onClose={onClose}>
        <ScrollView contentContainerStyle={styles.content}>
          {user ? (
            <>
              <View style={styles.hero}>
                <Pressable
                  style={[styles.heroPhoto, photoUploading && styles.heroPhotoUploading]}
                  onPress={handleChangePhoto}
                  disabled={photoUploading}
                >
                  {user.photoUrl ? (
                    <Image source={{ uri: user.photoUrl }} style={styles.heroPhotoImg} />
                  ) : (
                    <Text style={styles.heroPhotoText}>
                      {displayName
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </Text>
                  )}
                </Pressable>
                {editing ? (
                  <>
                    <TextInput
                      value={nameInput}
                      onChangeText={setNameInput}
                      placeholder={t("profile_name_placeholder")}
                      placeholderTextColor={colors.mute}
                      style={styles.heroNameInput}
                      autoFocus
                    />
                    <Text style={styles.heroEmail}>{user.email}</Text>
                    <TextInput
                      value={bioInput}
                      onChangeText={setBioInput}
                      placeholder={t("profile_bio_placeholder")}
                      placeholderTextColor={colors.mute}
                      style={styles.heroBioInput}
                      multiline
                      numberOfLines={2}
                    />
                    <View style={styles.editActions}>
                      <Pressable onPress={cancelEdit}>
                        <Text style={styles.editCancel}>{t("profile_cancel")}</Text>
                      </Pressable>
                      <Pressable style={styles.editSave} onPress={handleSave}>
                        <Text style={styles.editSaveLabel}>{t("profile_save")}</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.heroNameRow}>
                      <Text style={styles.heroName}>{displayName}</Text>
                      <Pressable style={styles.heroEditBtn} onPress={startEdit}>
                        <Ionicons name="create-outline" size={16} color={colors.mute} />
                      </Pressable>
                    </View>
                    <Text style={styles.heroEmail}>{user.email}</Text>
                    {displayBio ? <Text style={styles.heroBio}>"{displayBio}"</Text> : null}
                  </>
                )}
              </View>

              <Row label={t("profile_role")} value={roleLabel[user.role]} />
              {user.restaurantName ? (
                <Row label={t("profile_restaurant")} value={user.restaurantName} />
              ) : null}
              {user.restaurantId ? (
                <>
                  <Row label={t("profile_plan")} value={planValue} />
                  {showGoPro ? (
                    <Pressable
                      style={styles.goProBtn}
                      onPress={() =>
                        Linking.openURL(`${BASE}/pro?r=${user.restaurantId}`)
                      }
                    >
                      <Text style={styles.goProLabel}>{t("profile_go_pro")}</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              <Section label={t("profile_language")}>
                <View style={styles.pills}>
                  {LANGS.map((l) => (
                    <Pressable
                      key={l}
                      style={[styles.pill, lang === l && styles.pillActive]}
                      onPress={() => handleLangChange(l)}
                    >
                      <Text style={[styles.pillText, lang === l && styles.pillTextActive]}>
                        {l}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Section>

              <Section label={t("profile_model")}>
                <ModelOption
                  label={t("model_haiku")}
                  active={user.defaultModel === "haiku"}
                  onPress={() => handleModelChange("haiku")}
                />
                <ModelOption
                  label={t("model_sonnet")}
                  active={user.defaultModel === "sonnet"}
                  onPress={() => handleModelChange("sonnet")}
                />
                <ModelOption
                  label={t("model_opus")}
                  active={user.defaultModel === "opus"}
                  onPress={() => handleModelChange("opus")}
                />
              </Section>
            </>
          ) : null}

          <Pressable
            style={styles.dangerRow}
            onPress={() => {
              onClose();
              void signOut();
            }}
          >
            <Text style={styles.dangerLabel}>{t("profile_logout")}</Text>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          </Pressable>

          {user?.restaurantId ? (
            <Pressable style={styles.dangerRow} onPress={() => setLeaveOpen(true)}>
              <Text style={styles.dangerLabel}>{t("profile_leave_restaurant")}</Text>
              <Ionicons name="exit-outline" size={18} color={colors.danger} />
            </Pressable>
          ) : null}

          <Pressable style={styles.dangerRow} onPress={() => setDeleteOpen(true)}>
            <Text style={styles.dangerLabel}>{t("profile_delete_account")}</Text>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>

          <Pressable
            style={styles.footRow}
            onPress={() =>
              Linking.openURL(
                "mailto:andygomezgc@gmail.com?subject=Atelier%20—%20Soporte",
              )
            }
          >
            <Text style={styles.footLabel}>{t("profile_support")}</Text>
            <Ionicons name="mail-outline" size={18} color={colors.mute} />
          </Pressable>

          <View style={styles.legalRow}>
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL(`${BASE}/privacidad`)}
            >
              {t("profile_privacy")}
            </Text>
            <Text style={styles.legalDot}>·</Text>
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL(`${BASE}/terminos`)}
            >
              {t("profile_terms")}
            </Text>
          </View>

          <Text style={styles.versionText}>
            Atelier v{Constants.expoConfig?.version ?? "—"}
          </Text>
        </ScrollView>
      </BottomSheet>

      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
      <LeaveRestaurantSheet open={leaveOpen} onClose={() => setLeaveOpen(false)} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ModelOption({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.modelOption, active && styles.modelOptionActive]}
      onPress={onPress}
    >
      <Text style={[styles.modelOptionText, active && styles.modelOptionTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg },
  hero: { alignItems: "center", paddingVertical: spacing.md, gap: 4 },
  heroPhoto: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  heroPhotoUploading: { opacity: 0.5 },
  heroPhotoImg: { width: 72, height: 72, borderRadius: 36 },
  heroPhotoText: {
    color: colors.paper,
    fontFamily: fonts.sans,
    fontSize: 24,
    fontWeight: "600",
  },
  heroName: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  heroEmail: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  heroBio: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.inkSoft,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  // Edición inline: nombre + lápiz alineados en la misma fila.
  heroNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  heroEditBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  // Inputs editables — mismo estilo visual que heroName / heroBio (serif
  // italic) pero con border-bottom fino que indica "esto se puede editar".
  // Sin caja moderna; rompe la elegancia editorial del sheet.
  heroNameInput: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    textAlign: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
    paddingVertical: 4,
    minWidth: 200,
    alignSelf: "center",
  },
  heroBioInput: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.inkSoft,
    textAlign: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
    paddingVertical: 4,
    minWidth: 240,
    alignSelf: "center",
    marginTop: spacing.xs,
  },
  editActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  editCancel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    letterSpacing: 0.5,
  },
  // Guardar editorial: pill terracota lleno (acción primaria del edit).
  editSave: {
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
  },
  editSaveLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
  },
  rowLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  rowValue: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  section: {
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
    gap: spacing.sm,
  },
  sectionBody: { gap: spacing.xs },
  pills: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paper,
  },
  pillActive: { backgroundColor: colors.terracota, borderColor: colors.terracota },
  pillText: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.ink },
  pillTextActive: { color: colors.paper, fontWeight: "600" },
  modelOption: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 0.5,
    borderColor: colors.edge,
  },
  modelOptionActive: { borderColor: colors.terracota, backgroundColor: colors.paperWarm },
  modelOptionText: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  modelOptionTextActive: { color: colors.terracota, fontWeight: "600" },
  // CTA "Hacete Pro" — outline terracota pill (mismo look que el viejo
  // byokReturnBtn: acción secundaria destacada, no grita como el editSave).
  goProBtn: {
    borderWidth: 1,
    borderColor: colors.terracota,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    backgroundColor: "transparent",
    alignSelf: "center",
    marginBottom: spacing.sm,
  },
  goProLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  dangerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
  },
  dangerLabel: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.danger },
  // Pie del perfil — soporte (fila neutra), legales chiquitos y versión muda.
  footRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
  },
  footLabel: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  legalLink: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    textDecorationLine: "underline",
  },
  legalDot: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  versionText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    textAlign: "center",
    paddingBottom: spacing.sm,
  },
});
