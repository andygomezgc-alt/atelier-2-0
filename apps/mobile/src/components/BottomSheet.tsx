import { Modal, Pressable, StyleSheet, View } from "react-native";
import { colors, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
};

export function BottomSheet({ open, onClose, children, testID }: Props) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet} testID={testID}>
        <View style={styles.handle} />
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,17,15,0.4)" },
  sheet: {
    backgroundColor: colors.paperSoft,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.edge,
    marginTop: 10,
    marginBottom: spacing.sm,
  },
});
