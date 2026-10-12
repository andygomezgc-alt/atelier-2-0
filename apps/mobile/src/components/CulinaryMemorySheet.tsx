import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PatchCulinaryMemorySchema, type ChefNote, type ChefNotesResponse, type CulinaryMemoryResponse, type MemoryPreference } from "@atelier/shared";
import { getCulinaryMemory, patchCulinaryMemory, clearCulinaryMemory } from "@/src/api/culinary-memory";
import { deleteChefNote, getChefNotes } from "@/src/api/chef-notes";
import { ApiError } from "@/src/api/client";
import { useI18n } from "@/src/hooks/useI18n";
import { apiErrorMessage } from "@/src/lib/api-error";
import type { TranslationKey } from "@atelier/i18n";
import {
  applyCuisineRegister, hasUnsavedRelearn, hideCategory, MEMORY_CATEGORY_KEYS, memoryCategory, memoryPatchBody, relearnCategory,
  setCorrection, showCategory,
} from "@/src/lib/culinary-memory-draft";
import { BottomSheet } from "./BottomSheet";
import { ConfirmSheet } from "./ConfirmSheet";
import { Button } from "./Button";
import { showToast } from "./Toast";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const REGISTER_KEYS = ["memory_register_classic", "memory_register_contemporary", "memory_register_avantgarde"] as const;
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
  // Notas del chef: independientes de la versión/PATCH de la memoria y de "Borrar lo aprendido".
  const [notes, setNotes] = useState<ChefNotesResponse | null>(null);
  const [notesError, setNotesError] = useState("");
  const [noteToDelete, setNoteToDelete] = useState<ChefNote | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; void reload(); void loadNotes(); return () => { alive.current = false; }; }, [restaurantId]);
  async function reload() {
    setError("");
    try {
      const value = await getCulinaryMemory();
      if (!alive.current || value.restaurantId !== restaurantId) return;
      setData(value); setDraft(value); setConflict(false); setEditing(null);
    } catch (e) { if (alive.current) setError(apiErrorMessage(e, t)); }
  }
  async function loadNotes() {
    setNotesError("");
    try {
      const value = await getChefNotes();
      if (alive.current) setNotes(value);
    } catch (e) { if (alive.current) setNotesError(apiErrorMessage(e, t)); }
  }
  async function removeNote() {
    const note = noteToDelete;
    if (!note || noteBusy) return;
    setNoteBusy(true);
    const drop = () => setNotes(prev => prev ? { ...prev, notes: prev.notes.filter(n => n.id !== note.id) } : prev);
    try {
      await deleteChefNote(note.id);
      if (!alive.current) return;
      drop(); showToast(t("notes_deleted"));
    } catch (e) {
      if (!alive.current) return;
      // Ya la borró otra persona: se quita igual de la lista.
      if (e instanceof ApiError && e.status === 404) drop();
      else showToast(apiErrorMessage(e, t));
    } finally { if (alive.current) { setNoteBusy(false); setNoteToDelete(null); } }
  }
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(data);
  const relearnPending = hasUnsavedRelearn(data, draft);
  function close() { if (!busy) dirty ? setConfirm("close") : onClose(); }
  async function save(erase = false) {
    if (!draft || !data || busy) return;
    const body = PatchCulinaryMemorySchema.safeParse(memoryPatchBody(data, draft));
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
  function correct(key: MemoryPreference["key"], text: string) {
    setDraft(prev => prev ? setCorrection(prev, key, text) : prev);
  }
  const registers = REGISTER_KEYS.map(register => t(register));
  return <>
    <BottomSheet open onClose={close} testID="culinary-memory-sheet">
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("memory_title")}</Text>
        {error ? <><Text style={styles.note}>{error}</Text><Button label={t("memory_retry")} onPress={reload} /></> : !draft ? <Text style={styles.note}>{t("memory_loading")}</Text> : <>
          <Text style={styles.label}>{t("memory_identity")}</Text>
          <TextInput accessibilityLabel={t("memory_identity")} style={styles.input} multiline maxLength={1000}
            editable={draft.canEdit && !busy} value={draft.identityLine ?? ""} placeholder={t("memory_identity_hint")}
            placeholderTextColor={colors.mute} onChangeText={identityLine => setDraft({ ...draft, identityLine })} />
          <Text style={styles.label}>{t("memory_city")}</Text>
          <TextInput accessibilityLabel={t("memory_city")} style={styles.input} maxLength={80}
            editable={draft.canEdit && !busy} value={draft.city ?? ""} placeholder={t("memory_city_hint")}
            placeholderTextColor={colors.mute} onChangeText={city => setDraft({ ...draft, city })} />
          <View style={styles.row}><Text style={[styles.label, { flex: 1 }]}>{t("memory_enabled")}</Text>
            <Switch accessibilityLabel={t("memory_enabled")} value={draft.enabled} disabled={!draft.canEdit || busy || (!draft.learningAvailable && !draft.enabled)}
              onValueChange={enabled => setDraft({ ...draft, enabled })} /></View>
          <Text style={styles.note}>{t(draft.enabled ? "memory_note" : "memory_off")}</Text>
          {!draft.learningAvailable && <Text style={styles.note}>{t("memory_unavailable")}</Text>}
          <Text style={styles.label}>{t("memory_learned")}</Text>
          {!draft.learned.length && <Text style={styles.note}>{t("memory_empty")}</Text>}
          {MEMORY_CATEGORY_KEYS.map(key => {
            const { state, text } = memoryCategory(draft, key);
            const label = t(`memory_cat_${key}`);
            const named = (action: TranslationKey) => `${t(action)}: ${label}`;
            const filled = state === "declared" || state === "learned";
            return <View key={key} style={styles.trend}>
              <View style={styles.row}>
                <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
                {filled && <Text style={styles.tag}>{t(state === "declared" ? "memory_tag_declared" : "memory_tag_learned")}</Text>}
              </View>
              {filled && draft.canEdit && editing === key ? <>
                <TextInput autoFocus accessibilityLabel={named("memory_edit")} style={styles.input} multiline maxLength={160}
                  editable={!busy} value={text} onChangeText={value => correct(key, value)} />
                {key === "cuisine" && <View style={styles.chips}>
                  {REGISTER_KEYS.map((register, i) => <Pressable key={register} accessibilityRole="button" accessibilityLabel={registers[i]} disabled={busy}
                    style={styles.chip} onPress={() => correct(key, applyCuisineRegister(text, registers[i]!, registers))}>
                    <Text style={styles.actionText}>{registers[i]}</Text>
                  </Pressable>)}
                </View>}
              </> : state === "hidden" ? <Text style={styles.note}>{t("memory_hidden")}</Text> : filled && <Text style={styles.note}>{text}</Text>}
              {draft.canEdit && <View style={styles.actions}>
                {filled && <Pressable accessibilityRole="button" accessibilityLabel={named("memory_edit")} disabled={busy} style={styles.action} onPress={() => setEditing(key)}>
                  <Ionicons name="pencil-outline" size={18} color={colors.inkSoft} /><Text style={styles.actionText}>{t("memory_edit")}</Text>
                </Pressable>}
                {state === "declared" && <Pressable accessibilityRole="button" accessibilityLabel={named("memory_relearn")} disabled={busy} style={styles.action}
                  onPress={() => { setDraft(relearnCategory(draft, key)); setEditing(null); }}>
                  <Ionicons name="refresh-outline" size={18} color={colors.inkSoft} /><Text style={styles.actionText}>{t("memory_relearn")}</Text>
                </Pressable>}
                {state === "learned" && <Pressable accessibilityRole="button" accessibilityLabel={named("memory_hide")} disabled={busy} style={styles.action}
                  onPress={() => { setDraft(hideCategory(draft, key)); setEditing(null); }}>
                  <Ionicons name="close-outline" size={22} color={colors.inkSoft} />
                </Pressable>}
                {state === "hidden" && <Pressable accessibilityRole="button" accessibilityLabel={named("memory_show")} disabled={busy} style={styles.action}
                  onPress={() => setDraft(showCategory(draft, key))}>
                  <Ionicons name="eye-outline" size={18} color={colors.inkSoft} /><Text style={styles.actionText}>{t("memory_show")}</Text>
                </Pressable>}
                {state === "empty" && <Pressable accessibilityRole="button" accessibilityLabel={named("memory_declare")} disabled={busy} style={styles.action}
                  onPress={() => { correct(key, ""); setEditing(key); }}>
                  <Ionicons name="add-outline" size={20} color={colors.inkSoft} /><Text style={styles.actionText}>{t("memory_declare")}</Text>
                </Pressable>}
              </View>}
            </View>;
          })}
          {!!draft.excludedKeys.length && <Text style={styles.note}>{t("memory_hidden_note")}</Text>}
          {conflict && <><Text style={styles.note}>{t("memory_conflict")}</Text><Button label={t("memory_retry")} onPress={reload} disabled={busy} /></>}
          {draft.canEdit && <>
            {relearnPending && <Text style={styles.note}>{t("memory_relearn_hint")}</Text>}
            <Button label={t("memory_save")} disabled={busy || !dirty || conflict || draft.corrections.some(c => !c.text.trim())} onPress={() => save()} />
            <Button label={t("memory_delete")} variant="secondary" disabled={busy || conflict} onPress={() => setConfirm("delete")} />
          </>}
        </>}
        <Text style={styles.label}>{t("notes_title")}</Text>
        {notesError ? <><Text style={styles.note}>{notesError}</Text><Button label={t("memory_retry")} onPress={loadNotes} /></> : !notes ? <Text style={styles.note}>{t("memory_loading")}</Text> : <>
          {!notes.notes.length && <Text style={styles.note}>{t(notes.canEdit ? "notes_empty" : "notes_none")}</Text>}
          {notes.notes.map(note => <View key={note.id} style={[styles.trend, styles.row]}>
            <Text style={[styles.note, { flex: 1 }]}>{note.text}</Text>
            {notes.canEdit && <Pressable accessibilityRole="button" accessibilityLabel={t("notes_delete")} disabled={noteBusy} style={styles.action} onPress={() => setNoteToDelete(note)}>
              <Ionicons name="trash-outline" size={20} color={colors.inkSoft} />
            </Pressable>}
          </View>)}
        </>}
      </ScrollView>
    </BottomSheet>
    <ConfirmSheet open={!!confirm} title={t(confirm === "close" ? "memory_dirty" : "memory_delete")}
      body={confirm === "delete" ? t("memory_delete_note") : undefined} busy={busy} destructive
      confirmLabel={t(confirm === "close" ? "memory_discard" : "memory_delete")} cancelLabel={t("memory_cancel")}
      onCancel={() => setConfirm(null)} onConfirm={() => confirm === "close" ? onClose() : save(true)} />
    <ConfirmSheet open={!!noteToDelete} title={t("notes_delete")} body={noteToDelete?.text} busy={noteBusy} destructive
      confirmLabel={t("notes_delete")} cancelLabel={t("memory_cancel")}
      onCancel={() => { if (!noteBusy) setNoteToDelete(null); }} onConfirm={removeNote} />
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
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  tag: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute, borderWidth: 0.5, borderColor: colors.edge, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.edge, borderRadius: radii.pill },
});
