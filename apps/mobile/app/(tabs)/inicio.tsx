import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Eyebrow } from "@/src/components/Eyebrow";
import { Empty } from "@/src/components/Empty";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { useOfflineQueueSize, enqueueIdea, flushQueue } from "@/src/hooks/useOfflineQueue";
import { listIdeas, createIdea, patchIdea, type Idea } from "@/src/api/ideas";
import { showToast } from "@/src/components/Toast";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function InicioScreen() {
  const { t } = useI18n();
  const { state } = useAuth();
  const router = useRouter();
  const { refresh: refreshQueue } = useOfflineQueueSize();

  const [text, setText] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSave() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
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

  async function takeToAssistant(idea: Idea) {
    try {
      await patchIdea(idea.id, "in_chat");
    } catch {
      // non-blocking
    }
    router.push({
      pathname: "/(tabs)/asistente",
      params: { ideaId: idea.id, ideaText: idea.text },
    });
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
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
                  <Pressable
                    key={idea.id}
                    style={styles.ideaCard}
                    onPress={() => takeToAssistant(idea)}
                  >
                    <Text style={styles.ideaText}>{idea.text}</Text>
                    <Text style={styles.ideaMeta}>
                      {idea.authorName} · {t("inicio_idea_action")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  greetEm: { fontStyle: "italic", color: colors.terracota },
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
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
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
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  ideaText: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
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
