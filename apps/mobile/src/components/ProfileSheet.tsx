import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { patchMe, type CustomProvider, type MeUser } from "@/src/api/auth";
import { showToast } from "./Toast";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import type { Language } from "@atelier/i18n";
import type { Role } from "@atelier/shared";

type Props = { open: boolean; onClose: () => void };

const LANGS: ReadonlyArray<Language> = ["es", "it", "en"];

const PROVIDERS: ReadonlyArray<{ id: CustomProvider; label: string; modelHint: string }> = [
  { id: "anthropic", label: "Anthropic", modelHint: "claude-opus-4-7" },
  { id: "openai", label: "ChatGPT", modelHint: "gpt-4o" },
  { id: "google", label: "Google", modelHint: "gemini-2.5-flash" },
];

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
    setLang(l);
    await patchMe({ languagePref: l }).catch(() => null);
  }

  async function handleModelChange(model: "haiku" | "sonnet" | "opus") {
    await patchMe({ defaultModel: model }).catch(() => null);
    await refreshMe();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
          {user ? (
            <>
              <View style={styles.hero}>
                <View style={styles.heroPhoto}>
                  <Text style={styles.heroPhotoText}>
                    {user.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.heroName}>{user.name}</Text>
                <Text style={styles.heroEmail}>{user.email}</Text>
                {user.bio ? <Text style={styles.heroBio}>"{user.bio}"</Text> : null}
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
                  label="Haiku 4.5 — rápido para preguntas básicas"
                  active={user.defaultModel === "haiku"}
                  onPress={() => handleModelChange("haiku")}
                />
                <ModelOption
                  label="Sonnet 4.6 — rápido y robusto"
                  active={user.defaultModel === "sonnet"}
                  onPress={() => handleModelChange("sonnet")}
                />
                <ModelOption
                  label="Opus 4.7 — máxima profundidad"
                  active={user.defaultModel === "opus"}
                  onPress={() => handleModelChange("opus")}
                />
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

function BYOKSection({ user, onSaved }: { user: MeUser; onSaved: () => Promise<void> }) {
  const [provider, setProvider] = useState<CustomProvider>(user.customProvider ?? "anthropic");
  const [model, setModel] = useState(user.customModel ?? "");
  // Empty input means "leave the stored key untouched" on save. The user
  // explicitly clicks "Quitar" to clear, or types a new one to replace.
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProvider(user.customProvider ?? "anthropic");
    setModel(user.customModel ?? "");
  }, [user.customProvider, user.customModel]);

  const hint = PROVIDERS.find((p) => p.id === provider)?.modelHint ?? "";

  async function handleSave() {
    if (saving) return;
    if (!model.trim()) {
      showToast("Indicá el modelo");
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
      showToast(err instanceof Error ? err.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (saving) return;
    setSaving(true);
    try {
      await patchMe({
        customProvider: null,
        customModel: null,
        customApiKey: null,
      });
      setApiKey("");
      setModel("");
      await onSaved();
      showToast("API key eliminada — volverá a usarse el server");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.rowLabel}>Tu API key (opcional)</Text>
      <Text style={styles.byokHelp}>
        Usá tu propia key. Si dejás esto vacío, el chat usa la del servidor.
      </Text>

      <View style={styles.pills}>
        {PROVIDERS.map((p) => (
          <Pressable
            key={p.id}
            style={[styles.pill, provider === p.id && styles.pillActive]}
            onPress={() => setProvider(p.id)}
          >
            <Text style={[styles.pillText, provider === p.id && styles.pillTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={model}
        onChangeText={setModel}
        placeholder={`Modelo (ej. ${hint})`}
        placeholderTextColor={colors.mute}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.byokInput}
      />

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

      <View style={styles.byokActions}>
        <Pressable
          style={[styles.byokSaveBtn, saving && styles.byokSaveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.byokSaveLabel}>{saving ? "…" : "Guardar"}</Text>
        </Pressable>
        {user.customApiKeySet ? (
          <Pressable onPress={handleClear} disabled={saving}>
            <Text style={styles.byokClearLabel}>Quitar</Text>
          </Pressable>
        ) : null}
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
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  heroEmail: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  heroBio: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
    color: colors.inkSoft,
    textAlign: "center",
    marginTop: spacing.xs,
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
  byokClearLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    letterSpacing: 0.5,
  },
});
