import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MenuStyleHistory } from "@atelier/shared";
import { getMenuStyleHistory, activateMenuStyleVersion, discardMenuStyleVersion } from "@/src/api/menus";
import { useI18n } from "@/src/hooks/useI18n";
import { apiErrorMessage } from "@/src/lib/api-error";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { showToast } from "./Toast";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

type Props = {
  open: boolean; menuId: string; hasCustomStyle: boolean; exporting?: boolean;
  onClose: () => void; onApplied: () => Promise<unknown>;
  onViewPdf: (versionId?: string) => Promise<unknown>;
};
export function StylePreviewSheet({ open, menuId, hasCustomStyle, exporting, onClose, onApplied, onViewPdf }: Props) {
  const { t } = useI18n();
  const [history, setHistory] = useState<MenuStyleHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function load() {
    setFailed(false);
    try { setHistory(await getMenuStyleHistory()); }
    catch (err) { setFailed(true); showToast(apiErrorMessage(err, t)); }
  }
  useEffect(() => { if (open) { setHistory(null); void load(); } }, [open, menuId]);
  async function apply(versionId: string) {
    if (busy || !history) return;
    setBusy(true);
    try {
      await activateMenuStyleVersion(versionId, history.activeVersionId, menuId);
      await onApplied(); await load(); showToast(t("menu_style_activated"));
    } catch (err) { showToast(apiErrorMessage(err, t)); await load(); }
    finally { setBusy(false); }
  }
  async function discard(versionId: string) {
    if (busy) return;
    setBusy(true);
    try { await discardMenuStyleVersion(versionId); await load(); }
    catch (err) { showToast(apiErrorMessage(err, t)); }
    finally { setBusy(false); }
  }
  const disabled = busy || exporting;
  return <BottomSheet open={open} onClose={() => { if (!disabled) onClose(); }}>
    <View style={styles.content}>
      <Text style={styles.title}>{t("menu_style_history")}</Text>
      <Text style={styles.note}>{t("menu_style_activation_note")}</Text>
      {!history && !failed ? <ActivityIndicator color={colors.terracota} /> : null}
      {failed ? <Button label={t("menu_retry")} onPress={() => void load()} disabled={disabled} /> : null}
      <ScrollView style={{ maxHeight: 440 }}>
        {history && !history.activeVersionId && hasCustomStyle ? <View style={styles.card}>
          <Text style={styles.name}>{t("menu_style_current")}</Text>
          <Button label={t("style_preview_view_pdf")} variant="secondary" disabled={disabled} onPress={() => void onViewPdf()} />
        </View> : null}
        {history?.versions.length === 0 ? <Text style={styles.note}>{t("menu_style_history_empty")}</Text> : null}
        {history?.versions.map(version => <View key={version.id} style={styles.card}>
          <Text style={styles.name}>{version.name}</Text>
          <Text style={styles.note}>{t(version.isActive ? "menu_style_current" : version.activatedAt ? "menu_style_saved" : "menu_style_proposal")} · {new Date(version.createdAt).toLocaleDateString()}</Text>
          {version.refUrl ? <Button label={t("menu_style_original")} variant="secondary" disabled={disabled}
            onPress={() => void Linking.openURL(version.refUrl!).catch(err => showToast(apiErrorMessage(err, t)))} /> : <Text style={styles.note}>{t("menu_style_no_reference")}</Text>}
          <Button label={exporting ? "…" : t("style_preview_view_pdf")} variant="secondary" disabled={disabled}
            onPress={() => void onViewPdf(version.id)} />
          <Button label={t(version.activatedAt && !version.isActive ? "menu_style_restore" : "menu_style_activate")} disabled={disabled || failed}
            onPress={() => void apply(version.id)} />
          {!version.activatedAt && !version.isActive ? <Button label={t("menu_style_discard")} variant="ghost" disabled={disabled}
            onPress={() => void discard(version.id)} /> : null}
        </View>)}
      </ScrollView>
      <Button label={t("style_preview_close")} variant="secondary" disabled={disabled} onPress={onClose} />
    </View>
  </BottomSheet>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, gap: spacing.md, flexShrink: 1 },
  title: { fontFamily: fonts.serifItalic, fontSize: fontSizes.serifLg, color: colors.ink },
  name: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink, fontWeight: "600" },
  note: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.mute },
  card: { gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.edge },
});
