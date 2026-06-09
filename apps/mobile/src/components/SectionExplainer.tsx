// A-12 — Subtítulo breve y permanente debajo del header de una tab,
// pensado para que cada sección diga para qué sirve sin necesidad de un
// tour. No depende del estado del usuario; siempre visible.

import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

type Props = { text: string };

export function SectionExplainer({ text }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  text: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    lineHeight: fontSizes.bodySm * 1.5,
  },
});
