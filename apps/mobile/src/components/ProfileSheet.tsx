import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { patchMe, type CustomProvider, type MeUser } from "@/src/api/auth";
import { apiErrorMessage } from "@/src/lib/api-error";
import { showToast } from "./Toast";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import type { Language, TranslationKey } from "@atelier/i18n";
import type { Role } from "@atelier/shared";

type Props = { open: boolean; onClose: () => void };

const LANGS: ReadonlyArray<Language> = ["es", "it", "en"];

const PROVIDERS: ReadonlyArray<{ id: CustomProvider; label: string }> = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "ChatGPT" },
  { id: "google", label: "Google" },
];

// Nombre legible del proveedor para el texto "En pausa — estás usando tu
// propia clave de {provider}." (no usar el ID interno openai/anthropic/google).
// No i18n: son nombres propios iguales en los 3 idiomas.
const PROVIDER_LABEL: Record<CustomProvider, string> = {
  anthropic: "Anthropic",
  openai: "ChatGPT",
  google: "Google",
};

// 9 IDs cerrados con Andy (26-may-2026, validados contra docs oficiales de
// cada proveedor). El chef nunca tipea el ID a mano — solo elige tier. Esto
// elimina el bug "tipeé mal el modelo y el chat falla sin explicación".
//   - Anthropic: Haiku 4.5 lleva snapshot en el ID (es pre-4.6); Sonnet 4.6
//     y Opus 4.7 son canónicos sin fecha.
//   - OpenAI: gpt-5.5 es el flagship actual (Chat Completions).
//   - Google: gemini-3.5-flash GA estable desde 19-may-2026.
const BYOK_MODELS: Record<
  CustomProvider,
  ReadonlyArray<{ id: string; tierKey: TranslationKey }>
> = {
  anthropic: [
    { id: "claude-haiku-4-5-20251001", tierKey: "byok_tier_fast" },
    { id: "claude-sonnet-4-6", tierKey: "byok_tier_balanced" },
    { id: "claude-opus-4-7", tierKey: "byok_tier_powerful" },
  ],
  openai: [
    { id: "gpt-5.4-nano", tierKey: "byok_tier_fast" },
    { id: "gpt-5.4-mini", tierKey: "byok_tier_balanced" },
    { id: "gpt-5.5", tierKey: "byok_tier_powerful" },
  ],
  google: [
    { id: "gemini-2.5-flash-lite", tierKey: "byok_tier_fast" },
    { id: "gemini-2.5-flash", tierKey: "byok_tier_balanced" },
    { id: "gemini-3.5-flash", tierKey: "byok_tier_powerful" },
  ],
};

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

  async function handleLangChange(l: Language) {
    // P2-11 — antes: `.catch(() => null)`. El idioma se aplicaba en pantalla pero
    // podía no guardarse NUNCA sin avisar. Ahora avisamos y revertimos el
    // optimista si el PATCH falla (espejo de handleReturnToAppModels).
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

  // BYOK pausa — espejo exacto del criterio de `loadUserBYOK` en
  // apps/api/lib/byok-user.ts: si los 3 campos están guardados, el motor
  // enruta por la key del usuario y los modelos Claude de arriba quedan
  // inertes. Acá lo comunicamos visualmente atenuando las cards y
  // mostrando un botón único para volver al estado app.
  const byokActive =
    !!user && user.customApiKeySet && !!user.customProvider && !!user.customModel;

  async function handleReturnToAppModels() {
    try {
      await patchMe({ customProvider: null, customModel: null, customApiKey: null });
      await refreshMe();
      showToast(t("byok_back_to_app_models_toast"));
    } catch (err) {
      showToast(apiErrorMessage(err, t));
    }
  }

  // Edición inline de nombre + bio (icono lápiz). Mismo patrón optimistic
  // que usamos en alérgenos: el override local se aplica al instante, se
  // revierte si el PATCH falla, se limpia cuando refreshMe trae los nuevos.
  const [editing, setEditing] = useState(false);
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

  // Cuando refreshMe trae los valores nuevos del server, limpiar overrides.
  useEffect(() => {
    if (!user) return;
    if (nameOverride !== null && user.name === nameOverride) setNameOverride(null);
    if (bioOverride !== null && (user.bio ?? "") === bioOverride) setBioOverride(null);
  }, [user, nameOverride, bioOverride]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
          {user ? (
            <>
              <View style={styles.hero}>
                <View style={styles.heroPhoto}>
                  <Text style={styles.heroPhotoText}>
                    {displayName
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
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
                  disabled={byokActive}
                  onPress={() => handleModelChange("haiku")}
                />
                <ModelOption
                  label={t("model_sonnet")}
                  active={user.defaultModel === "sonnet"}
                  disabled={byokActive}
                  onPress={() => handleModelChange("sonnet")}
                />
                <ModelOption
                  label={t("model_opus")}
                  active={user.defaultModel === "opus"}
                  disabled={byokActive}
                  onPress={() => handleModelChange("opus")}
                />
                {byokActive && user.customProvider ? (
                  <View style={styles.pauseBlock}>
                    <Text style={styles.pauseNote}>
                      {t("byok_paused_note", {
                        provider: PROVIDER_LABEL[user.customProvider],
                      })}
                    </Text>
                    <Pressable
                      style={styles.byokReturnBtn}
                      onPress={handleReturnToAppModels}
                    >
                      <Text style={styles.byokReturnLabel}>
                        {t("byok_back_to_app_models")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </Section>

              <BYOKSection user={user} onSaved={refreshMe} />
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
        </ScrollView>
    </BottomSheet>
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
  sublabel,
  active,
  disabled,
  onPress,
}: {
  label: string;
  // ID técnico del modelo, opcional. Se usa solo en el selector BYOK para
  // que el chef pueda diagnosticar si algo falla; arriba ("Modelo Claude")
  // queda en blanco para mantener el sheet limpio.
  sublabel?: string;
  active: boolean;
  // BYOK pausa — cuando es true, la card se atenúa al 40 % y descarta el tap.
  // El check (active) sigue visible atenuado: cuando el chef vuelva a la app
  // ve cuál tenía elegido antes. Si en el checkpoint se confunde, lo sacamos.
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.modelOption,
        active && styles.modelOptionActive,
        disabled && styles.modelOptionDisabled,
      ]}
      onPress={disabled ? undefined : onPress}
    >
      <Text style={[styles.modelOptionText, active && styles.modelOptionTextActive]}>{label}</Text>
      {sublabel ? <Text style={styles.modelOptionSub}>{sublabel}</Text> : null}
    </Pressable>
  );
}

function BYOKSection({ user, onSaved }: { user: MeUser; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<CustomProvider>(user.customProvider ?? "anthropic");
  // model holds the FULL model ID (eg. "claude-sonnet-4-6"). Set only from
  // the tier selector — never typed by hand — so we can't persist garbage
  // IDs that the provider would reject at runtime.
  const [model, setModel] = useState(user.customModel ?? "");
  // Empty input means "leave the stored key untouched" on save. The user
  // explicitly clicks "Quitar" to clear, or types a new one to replace.
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProvider(user.customProvider ?? "anthropic");
    setModel(user.customModel ?? "");
  }, [user.customProvider, user.customModel]);

  // Switching provider resets the chosen model UNLESS the chef goes back to
  // the provider they already had saved — then we restore the saved pick so
  // the active tier card stays highlighted.
  function handleProviderChange(next: CustomProvider) {
    setProvider(next);
    setModel(next === user.customProvider ? (user.customModel ?? "") : "");
  }

  async function handleSave() {
    if (saving) return;
    if (!model.trim()) {
      showToast("Elegí un modelo");
      return;
    }
    if (!user.customApiKeySet && !apiKey.trim()) {
      showToast("Pegá tu API key");
      return;
    }
    setSaving(true);
    try {
      await patchMe({
        customProvider: provider,
        customModel: model.trim(),
        // Only send the key if the user typed a new one; empty leaves it.
        ...(apiKey.trim() ? { customApiKey: apiKey.trim() } : {}),
      });
      setApiKey("");
      await onSaved();
      showToast("Guardado");
    } catch (err) {
      showToast(apiErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  }

  const models = BYOK_MODELS[provider];

  return (
    <View style={styles.section}>
      <Text style={styles.rowLabel}>Tu API key (opcional)</Text>
      <Text style={styles.byokHelp}>
        Usá tu propia key. Si dejás esto vacío, el chat usa la del servidor.
      </Text>
      <Text style={styles.byokHelp}>{t("byok_help_anthropic_note")}</Text>

      <View style={styles.pills}>
        {PROVIDERS.map((p) => (
          <Pressable
            key={p.id}
            style={[styles.pill, provider === p.id && styles.pillActive]}
            onPress={() => handleProviderChange(p.id)}
          >
            <Text style={[styles.pillText, provider === p.id && styles.pillTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {models.map((m) => (
        <ModelOption
          key={m.id}
          label={t(m.tierKey)}
          sublabel={m.id}
          active={model === m.id}
          onPress={() => setModel(m.id)}
        />
      ))}

      <TextInput
        value={apiKey}
        onChangeText={setApiKey}
        placeholder={user.customApiKeySet ? "•••• guardada — pegá una nueva para reemplazar" : "API key"}
        placeholderTextColor={colors.mute}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={styles.byokInput}
      />

      {/* "Quitar" antes vivía acá; ahora hay un solo camino para salir del
          modo BYOK: el botón "Volver a los modelos de la app" arriba, en la
          sección Modelo Claude, visible solo cuando byokActive. */}
      <View style={styles.byokActions}>
        <Pressable
          style={[styles.byokSaveBtn, saving && styles.byokSaveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.byokSaveLabel}>{saving ? "…" : "Guardar"}</Text>
        </Pressable>
      </View>
    </View>
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
  // ID técnico debajo del tier en el selector BYOK. Gris chico independiente
  // del active state — la jerarquía visual del card la define el borde + fondo.
  modelOptionSub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: 2,
  },
  // BYOK pausa — las 3 cards de Modelo Claude se atenúan cuando hay key
  // propia activa. opacity 0.4 sobre los estilos existentes (active/inactive
  // se siguen calculando, solo se ven más suaves). El check terracota queda
  // visible atenuado a propósito (decisión validada).
  modelOptionDisabled: { opacity: 0.4 },
  // Bloque debajo de las cards atenuadas: texto explicativo + botón "Volver".
  pauseBlock: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  pauseNote: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  // Botón secundario outline — borde terracota fino, fondo transparente.
  // Se usa para "Volver a los modelos de la app" porque es una acción
  // secundaria (deshacer el modo BYOK); no compite en peso visual con
  // "Guardar" que sí es pill terracota llena.
  byokReturnBtn: {
    borderWidth: 1,
    borderColor: colors.terracota,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    backgroundColor: "transparent",
  },
  byokReturnLabel: {
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
  byokHelp: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: -spacing.xs,
  },
  byokInput: {
    backgroundColor: colors.paper,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.ink,
  },
  byokActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  byokSaveBtn: {
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
  },
  byokSaveBtnDisabled: { opacity: 0.4 },
  byokSaveLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
});
