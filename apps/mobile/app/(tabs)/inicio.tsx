import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Eyebrow } from "@/src/components/Eyebrow";
import { Empty } from "@/src/components/Empty";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { SectionExplainer } from "@/src/components/SectionExplainer";
import { ensureRestaurant } from "@/src/components/LazyRestaurantHost";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { useOfflineQueueSize, enqueueIdea, flushQueue } from "@/src/hooks/useOfflineQueue";
import { listIdeas, createIdea, patchIdea, deleteIdea, type Idea } from "@/src/api/ideas";
import { showToast } from "@/src/components/Toast";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function InicioScreen() {
  const { t } = useI18n();
  const { state } = useAuth();
  const router = useRouter();
  const { refresh: refreshQueue } = useOfflineQueueSize();
  const kb = useKeyboardHeight();

  const [text, setText] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Idea | null>(null);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const userName =
    state.status === "signed-in" || state.status === "needs-restaurant"
      ? state.user.name.split(" ")[0]
      : "";

  const reload = useCallback(async () => {
    try {
      const flushed = await flushQueue();
      if (flushed.length > 0) showToast(t("toast_idea_saved"));
      const data = await listIdeas();
      setIdeas(data);
    } catch {
      // keep current list
    } finally {
      setLoading(false);
      void refreshQueue();
    }
  }, [t, refreshQueue]);

  // useFocusEffect (no useEffect): las tabs quedan montadas, así que al
  // volver de guardar una receta hay que refetchear o la nota recién
  // archivada seguiría visible hasta reabrir la app.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function handleSave() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      // A-12 — lazy create del restaurante/proyecto si todavía no hay uno.
      // Si el chef cancela el modal, abortamos silenciosamente sin toast.
      try {
        await ensureRestaurant();
      } catch {
        setSaving(false);
        return;
      }
      const idea = await createIdea(text.trim());
      setIdeas((prev) => [idea, ...prev]);
      setText("");
      showToast(t("toast_idea_saved"));
    } catch {
      await enqueueIdea(text.trim());
      setText("");
      showToast(t("toast_idea_saved_offline"));
      void refreshQueue();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await deleteIdea(id);
      setIdeas((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  async function takeToAssistant(idea: Idea) {
    try {
      await patchIdea(idea.id, { status: "in_chat" });
    } catch {
      // non-blocking
    }
    router.push({
      pathname: "/(tabs)/asistente",
      params: { ideaId: idea.id, ideaText: idea.text },
    });
  }

  function openEdit(idea: Idea) {
    setEditing(idea);
    setEditText(idea.text);
  }

  async function handleSaveEdit() {
    if (!editing || savingEdit) return;
    const trimmed = editText.trim();
    if (!trimmed) return;
    if (trimmed === editing.text) {
      setEditing(null);
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await patchIdea(editing.id, { text: trimmed });
      setIdeas((prev) =>
        prev.map((i) => (i.id === editing.id ? { ...i, text: updated.text } : i)),
      );
      setEditing(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <Screen>
      <SectionExplainer text={t("section_explainer_inicio")} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
          <Text style={styles.greet}>
            {t("inicio_greet", { name: userName })}{" "}
            <Text style={styles.greetEm}>{t("inicio_greet_em")}</Text>
          </Text>

          <View>
            <Eyebrow>{t("eyebrow_bloc")}</Eyebrow>
            <View style={styles.ideaBox}>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                placeholder={t("inicio_placeholder")}
                placeholderTextColor={colors.mute}
                style={styles.ideaInput}
              />
              <Pressable
                onPress={handleSave}
                disabled={!text.trim() || saving}
                style={[styles.saveBtn, (!text.trim() || saving) && styles.saveBtnDisabled]}
              >
                <Text style={styles.saveLabel}>
                  {saving ? "…" : t("btn_save")}
                </Text>
              </Pressable>
            </View>
          </View>

          <View>
            <Eyebrow>{t("eyebrow_ultimas_ideas")}</Eyebrow>
            {loading ? (
              <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.md }} />
            ) : ideas.length === 0 ? (
              <Empty icon="bulb-outline" title={t("empty_inicio_title")} sub={t("empty_inicio_sub")} />
            ) : (
              <View style={styles.list}>
                {ideas.map((idea) => (
                  <View key={idea.id} style={styles.ideaCard}>
                    <Pressable
                      style={styles.ideaBody}
                      onPress={() => takeToAssistant(idea)}
                    >
                      <Text style={styles.ideaText}>{idea.text}</Text>
                      <Text style={styles.ideaMeta}>
                        {idea.authorName} · {t("inicio_idea_action")}
                      </Text>
                    </Pressable>
                    <Pressable
                      hitSlop={10}
                      onPress={() => openEdit(idea)}
                      style={styles.ideaIconBtn}
                      accessibilityLabel={t("inicio_idea_edit_action")}
                    >
                      <Ionicons name="pencil-outline" size={18} color={colors.mute} />
                    </Pressable>
                    <Pressable
                      hitSlop={10}
                      onPress={() => setPendingDelete(idea)}
                      style={styles.ideaIconBtn}
                      accessibilityLabel={t("confirm_delete")}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.mute} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
      </ScrollView>
      <Modal
        visible={!!editing}
        animationType="fade"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <View style={[styles.modalBackdrop, { paddingBottom: kb }]}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("inicio_idea_edit_title")}</Text>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              placeholder={t("inicio_placeholder")}
              placeholderTextColor={colors.mute}
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEditing(null)}
                style={[styles.modalBtn, styles.modalBtnGhost]}
                disabled={savingEdit}
              >
                <Text style={styles.modalBtnGhostLabel}>{t("confirm_cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveEdit}
                disabled={!editText.trim() || savingEdit}
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  (!editText.trim() || savingEdit) && styles.saveBtnDisabled,
                ]}
              >
                <Text style={styles.saveLabel}>
                  {savingEdit ? "…" : t("btn_save")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <ConfirmSheet
        open={!!pendingDelete}
        title={t("confirm_delete_idea_title")}
        body={
          pendingDelete && pendingDelete.conversationsCount > 0
            ? t("confirm_delete_idea_body_with_chat", {
                name: pendingDelete.text,
              })
            : t("confirm_delete_idea_body", {
                name: pendingDelete?.text ?? "",
              })
        }
        confirmLabel={t("confirm_delete")}
        cancelLabel={t("confirm_cancel")}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xxl,
  },
  greet: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    lineHeight: fontSizes.serifLg * 1.3,
  },
  greetEm: { fontFamily: fonts.serifItalic, color: colors.terracota },
  ideaBox: {
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  ideaInput: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    minHeight: 60,
    textAlignVertical: "top",
  },
  saveBtn: {
    alignSelf: "flex-end",
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 1.4,
  },
  list: { marginTop: spacing.sm, gap: spacing.sm },
  ideaCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  ideaBody: { flex: 1 },
  ideaIconBtn: { paddingTop: 2, paddingLeft: spacing.xs },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifMd ?? fontSizes.body,
    color: colors.ink,
  },
  modalInput: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    minHeight: 100,
    textAlignVertical: "top",
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.sm ?? radii.md,
    padding: spacing.sm,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  modalBtn: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
  },
  modalBtnGhost: { backgroundColor: "transparent" },
  modalBtnPrimary: { backgroundColor: colors.terracota },
  modalBtnGhostLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    fontWeight: "600",
    letterSpacing: 1.4,
  },
  ideaText: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    lineHeight: fontSizes.body * 1.4,
  },
  ideaMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: spacing.xs,
    letterSpacing: 0.5,
  },
});
