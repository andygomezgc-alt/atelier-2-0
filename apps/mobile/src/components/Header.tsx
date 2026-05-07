import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

type Props = {
  title?: string;
  back?: boolean;
  onBack?: () => void;
  onAvatar?: () => void;
  initials: string;
  right?: React.ReactNode;
};

export function Header({ title, back, onBack, onAvatar, initials, right }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.side}>
        {back ? (
          <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.teal} />
          </Pressable>
        ) : (
          <Text style={styles.mark}>
            <Text style={styles.markGlyph}>A</Text>telier
          </Text>
        )}
      </View>

      {title ? <Text style={styles.title}>{title}</Text> : null}

      <View style={[styles.side, styles.sideRight]}>
        {right}
        <Pressable
          onPress={onAvatar}
          hitSlop={6}
          style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 54,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
    backgroundColor: colors.paper,
  },
  side: {
    minWidth: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sideRight: { justifyContent: "flex-end" },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifMd,
    color: colors.teal,
  },
  markGlyph: { color: colors.terracota },
  title: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifMd,
    color: colors.ink,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPressed: { opacity: 0.85 },
  avatarText: {
    color: colors.paper,
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    fontWeight: "600",
  },
});
