// The ingredient matches several sibling products of one family (same base
// name, different origin or calibre). The chef picks one, or none to create
// a new product. No alias is saved: the generic text must stay ambiguous.
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AmbiguousCandidate } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  rawText: string;
  candidates: AmbiguousCandidate[];
  title: string;
  body: string;
  noneLabel: string;
  onPick: (productId: string) => void;
  onNone: () => void;
};

export function PickVariantSheet({ open, rawText, candidates, title, body, noneLabel, onPick, onNone }: Props) {
  return (
    // Dismissing (backdrop, Android back) must not mean "none": that would
    // create a duplicate draft. Only the explicit button answers "none".
    <Modal visible={open} animationType="fade" transparent onRequestClose={() => undefined}>
      <Pressable style={styles.backdrop} onPress={() => undefined}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.raw}>«{rawText}»</Text>
          <Text style={styles.body}>{body}</Text>
          <ScrollView style={styles.list}>
            {candidates.map((c) => {
              const detail = [c.origen, c.calibreLabel].filter(Boolean).join(" · ");
              return (
                <Pressable key={c.id} testID={`pick-variant-option-${c.id}`} style={styles.option} onPress={() => onPick(c.id)}>
                  <Text style={styles.optionName}>{c.name}</Text>
                  {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable testID="pick-variant-none" style={styles.btnGhost} onPress={onNone}>
            <Text style={styles.btnGhostLabel}>{noneLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: 360, maxHeight: "80%", backgroundColor: colors.paper, borderRadius: radii.lg, padding: spacing.xl, gap: spacing.md },
  title: { fontFamily: fonts.serifItalic, fontSize: fontSizes.serifLg, color: colors.ink },
  raw: { fontFamily: fonts.serif, fontSize: fontSizes.body, color: colors.terracota },
  body: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  list: { flexGrow: 0 },
  option: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 0.5, borderColor: colors.edge, marginBottom: spacing.sm, backgroundColor: colors.paperSoft },
  optionName: { fontFamily: fonts.serif, fontSize: fontSizes.body, color: colors.ink },
  optionDetail: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  btnGhost: { alignSelf: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.pill, borderWidth: 0.5, borderColor: colors.edge },
  btnGhostLabel: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.ink },
});
