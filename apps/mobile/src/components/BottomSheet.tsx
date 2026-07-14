import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { colors, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
};

export function BottomSheet({ open, onClose, children, testID }: Props) {
  // El sheet está pegado al fondo de la ventana; en Android edge-to-edge el
  // teclado no la redimensiona, así que sumamos su altura al padding inferior
  // para empujar el contenido justo por encima. Arregla todos los sheets.
  const kb = useKeyboardHeight();
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: spacing.xl + kb }]} testID={testID}>
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
