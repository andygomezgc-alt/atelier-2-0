// Bottom sheet that lists the user's past conversations. Tapping one resolves
// the chosen conversation id back to the caller (asistente), which navigates
// to the assistant with `conversationId` so the existing chat reloads.
//
// Conversations may or may not have an anchored idea; the API returns
// `ideaText: string | null` and we show a muted "Sin idea anclada" line when
// it's missing.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/hooks/useI18n";
import {
  listConversations,
  type ConversationSummary,
} from "@/src/api/conversations";
import { Empty } from "./Empty";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (conv: ConversationSummary) => void;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return iso;
  }
}

export function PreviousChatsSheet({ open, onClose, onPick }: Props) {
  const { t } = useI18n();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listConversations()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.title}>{t("chats_anteriores_title")}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {loading ? (
          <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xl }} />
        ) : items.length === 0 ? (
          <Empty
            icon="chatbubbles-outline"
            title={t("chats_anteriores_empty_title")}
            sub={t("chats_anteriores_empty_sub")}
          />
        ) : (
          items.map((c) => (
            <Pressable
              key={c.id}
              style={styles.row}
              onPress={() => {
                onPick(c);
                onClose();
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.itemText,
                    !c.ideaText && styles.itemTextMute,
                  ]}
                  numberOfLines={2}
                >
                  {c.ideaText ?? t("chats_anteriores_no_idea")}
                </Text>
                <Text style={styles.itemMeta}>
                  {formatDate(c.createdAt)} · {c.modelUsed}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mute} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  row: {
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
  itemText: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    lineHeight: fontSizes.body * 1.4,
  },
  itemTextMute: { color: colors.mute },
  itemMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: 4,
    letterSpacing: 0.4,
  },
});
