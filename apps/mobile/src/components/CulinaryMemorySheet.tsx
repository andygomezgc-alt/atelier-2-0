import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PatchCulinaryMemorySchema, type CulinaryMemoryResponse, type MemoryPreference } from "@atelier/shared";
import { getCulinaryMemory, patchCulinaryMemory, clearCulinaryMemory } from "@/src/api/culinary-memory";
import { ApiError } from "@/src/api/client";
import { useI18n } from "@/src/hooks/useI18n";
import { apiErrorMessage } from "@/src/lib/api-error";
import { BottomSheet } from "./BottomSheet";
import { ConfirmSheet } from "./ConfirmSheet";
import { Button } from "./Button";
import { showToast } from "./Toast";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

type Props = { restaurantId: string; onClose: () => void };
export function CulinaryMemorySheet({ restaurantId, onClose }: Props) {
  const { t } = useI18n();
  const [data, setData] = useState<CulinaryMemoryResponse | null>(null);
  const [draft, setDraft] = useState<CulinaryMemoryResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "close" | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; void reload(); return () => { alive.current = false; }; }, [restaurantId]);
  async function reload() {
    setError("");
    try {
      const value = await getCulinaryMemory();
      if (!alive.current || value.restaurantId !== restaurantId) return;
      setData(value); setDraft(value); setConflict(false); setEditing(null);
    } catch (e) { if (alive.current) setError(apiErrorMessage(e, t)); }
  }
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(data);
  function close() { if (!busy) dirty ? setConfirm("close") : onClose(); }
  async function save(erase = false) {
    if (!draft || !data || busy) return;
    const body = PatchCulinaryMemorySchema.safeParse({ expectedVersion: data.version, enabled: draft.enabled,
      identityLine: draft.identityLine, corrections: draft.corrections, excludedKeys: draft.excludedKeys });
    if (!erase && !body.success) return;
    setBusy(true);
    try {
      const value = erase ? await clearCulinaryMemory(data.version) : await patchCulinaryMemory(body.success ? body.data : { expectedVersion: data.version });
      if (!alive.current) return;
      setData(value); setDraft(value); setConfirm(null); setEditing(null); showToast(t("memory_saved"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setConflict(true); showToast(t("memory_conflict")); }
      else showToast(apiErrorMessage(e, t));
    } finally { if (alive.current) setBusy(false); }
  }
  const trends = draft ? [...draft.corrections, ...draft.learned.filter(f => !draft.excludedKeys.includes(f.key) && !draft.corrections.some(c => c.key === f.key))] : [];
  function correct(item: MemoryPreference, text: string) {
    setDraft(prev => prev ? { ...prev, corrections: [...prev.corrections.filter(c => c.key !== item.key), { key: item.key, text }] } : prev);
  }
  return <>
    <BottomSheet open onClose={close} testID="culinary-memory-sheet">
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("memory_title")}</Text>
        {error ? <><Text style={styles.note}>{error}</Text><Button label={t("memory_retry")} onPress={reload} /></> : !draft ? <Text style={styles.note}>{t("memory_loading")}</Text> : <>
          <Text style={styles.label}>{t("memory_identity")}</Text>
          <TextInput accessibilityLabel={t("memory_identity")} style={styles.input} multiline maxLength={1000}
            editable={draft.canEdit && !busy} value={draft.identityLine ?? ""} placeholder={t("memory_identity_hint")}
            placeholderTextColor={colors.mute} onChangeText={identityLine => setDraft({ ...draft, identityLine })} />
          <View style={styles.row}><Text style={[styles.label, { flex: 1 }]}>{t("memory_enabled")}</Text>
            <Switch accessibilityLabel={t("memory_enabled")} value={draft.enabled} disabled={!draft.canEdit || busy || (!draft.learningAvailable && !draft.enabled)}
              onValueChange={enabled => setDraft({ ...draft, enabled })} /></View>
          <Text style={styles.note}>{t(draft.enabled ? "memory_note" : "memory_off")}</Text>
          {!draft.learningAvailable && <Text style={styles.note}>{t("memory_unavailable")}</Text>}
          <Text style={styles.label}>{t("memory_learned")}</Text>
          {!trends.length && <Text style={styles.note}>{t("memory_empty")}</Text>}
          {trends.map(item => <View key={item.key} style={styles.trend}>
            {editing === item.key ? <TextInput autoFocus accessibilityLabel={t("memory_edit")} style={styles.input} multiline maxLength={160}
              editable={!busy} value={item.text} onChangeText={text => correct(item, text)} /> : <Text style={styles.note}>{item.text}</Text>}
            {draft.canEdit && <View style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityLabel={t("memory_edit")} disabled={busy} style={styles.action} onPress={() => setEditing(item.key)}>
                <Ionicons name="pencil-outline" size={18} color={colors.inkSoft} /><Text style={styles.actionText}>{t("memory_edit")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t("memory_hide")} disabled={busy} style={styles.action}
                onPress={() => setDraft({ ...draft, corrections: draft.corrections.filter(c => c.key !== item.key), excludedKeys: [...new Set([...draft.excludedKeys, item.key])] })}>
                <Ionicons name="close-outline" size={22} color={colors.inkSoft} />
              </Pressable>
            </View>}
          </View>)}
          {!!draft.excludedKeys.length && <>
            <Text style={styles.note}>{t("memory_hidden_note")}</Text>
            {draft.canEdit && <Button label={t("memory_restore")} variant="secondary" disabled={busy} onPress={() => setDraft({ ...draft, excludedKeys: [] })} />}
          </>}
          {conflict && <><Text style={styles.note}>{t("memory_conflict")}</Text><Button label={t("memory_retry")} onPress={reload} disabled={busy} /></>}
          {draft.canEdit && <>
            <Button label={t("memory_save")} disabled={busy || !dirty || conflict || draft.corrections.some(c => !c.text.trim())} onPress={() => save()} />
            <Button label={t("memory_delete")} variant="secondary" disabled={busy || conflict} onPress={() => setConfirm("delete")} />
          </>}
        </>}
      </ScrollView>
    </BottomSheet>
    <ConfirmSheet open={!!confirm} title={t(confirm === "close" ? "memory_dirty" : "memory_delete")}
      body={confirm === "delete" ? t("memory_delete_note") : undefined} busy={busy} destructive
      confirmLabel={t(confirm === "close" ? "memory_discard" : "memory_delete")} cancelLabel={t("memory_cancel")}
      onCancel={() => setConfirm(null)} onConfirm={() => confirm === "close" ? onClose() : save(true)} />
  </>;
}
const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md },
  title: { fontFamily: fonts.serifItalic, fontSize: fontSizes.serifLg, color: colors.ink },
  label: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink, fontWeight: "600" },
  note: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft, lineHeight: 23 },
  input: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink, borderWidth: 1, borderColor: colors.edge, borderRadius: 8, padding: spacing.md, minHeight: 64, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  trend: { borderBottomWidth: 0.5, borderBottomColor: colors.edge, paddingBottom: spacing.sm },
  action: { minWidth: 48, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  actionText: { fontFamily: fonts.sans, color: colors.inkSoft },
});
