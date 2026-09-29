import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { createChefNote } from "@/src/api/chef-notes";
import { useI18n } from "@/src/hooks/useI18n";
import { apiErrorMessage } from "@/src/lib/api-error";
import { CHEF_NOTE_MAX_LENGTH, isNoteTextValid, noteDraftFromMessage } from "@/src/lib/chef-notes";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { showToast } from "./Toast";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

// "Recordar esto": guarda un mensaje del chat como nota del chef. El teclado lo
// compensa BottomSheet (padding inferior + altura del teclado, Android edge-to-edge).
type Props = { text: string; onClose: () => void };
export function RememberNoteSheet({ text, onClose }: Props) {
  const { t } = useI18n();
  const [value, setValue] = useState(() => noteDraftFromMessage(text));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const valid = isNoteTextValid(value);
  function close() { if (!busyRef.current) onClose(); }
  async function save() {
    if (busyRef.current || !valid) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      await createChefNote(value.trim());
      if (!alive.current) return;
      showToast(t("notes_saved"));
      onClose();
    } catch (e) {
      if (alive.current) setError(apiErrorMessage(e, t));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <BottomSheet open onClose={close} testID="remember-note-sheet">
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("notes_remember")}</Text>
        <Text style={styles.note}>{t("notes_remember_hint")}</Text>
        <TextInput accessibilityLabel={t("notes_remember")} style={styles.input} multiline maxLength={CHEF_NOTE_MAX_LENGTH}
          editable={!busy} value={value} onChangeText={next => { setValue(next); setError(""); }} />
        <Text style={styles.counter}>{`${value.length}/${CHEF_NOTE_MAX_LENGTH}`}</Text>
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        <View style={styles.actions}>
          <Button label={t("notes_save")} disabled={busy || !valid} onPress={save} />
          <Button label={t("memory_cancel")} variant="secondary" disabled={busy} onPress={close} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md },
  title: { fontFamily: fonts.serifItalic, fontSize: fontSizes.serifLg, color: colors.ink },
  note: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft, lineHeight: 23 },
  input: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink, borderWidth: 1, borderColor: colors.edge, borderRadius: 8, padding: spacing.md, minHeight: 96, textAlignVertical: "top" },
  counter: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute, alignSelf: "flex-end" },
  error: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.danger, lineHeight: 23 },
  actions: { gap: spacing.sm },
});
