// apps/mobile/src/components/MarkdownText.tsx
// Cuerpo de las respuestas del sous-chef: markdown ligero + cantidades en
// terracota (C-05). Reemplaza a HighlightedText + heurística isTitle de la
// pantalla. Estilo cuaderno editorial (spec 2026-06-10).

import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { parseAssistantMarkdown, type Span } from "@/src/lib/markdown";
import { highlightQuantities } from "@/src/lib/highlight-quantities";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

// Cantidades/temperaturas en terracota bold solo en texto normal; los spans
// bold/italic ya tienen su énfasis propio.
function SpanText({ span, idx }: { span: Span; idx: number }) {
  if (span.bold) {
    return (
      <Text key={idx} style={styles.bold}>
        {span.text}
      </Text>
    );
  }
  if (span.italic) {
    return (
      <Text key={idx} style={styles.italic}>
        {span.text}
      </Text>
    );
  }
  const toks = highlightQuantities(span.text);
  return (
    <Text key={idx}>
      {toks.map((tok, i) =>
        tok.type === "qty" ? (
          <Text key={i} style={styles.qty}>
            {tok.text}
          </Text>
        ) : (
          tok.text
        ),
      )}
    </Text>
  );
}

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) => (
        <SpanText key={i} span={s} idx={i} />
      ))}
    </>
  );
}

export const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  const blocks = parseAssistantMarkdown(text);
  return (
    <View style={styles.wrap}>
      {blocks.map((b, i) => {
        if (b.type === "title" || b.type === "heading") {
          return (
            <Text key={i} style={styles.title}>
              {b.text}
            </Text>
          );
        }
        if (b.type === "paragraph") {
          return (
            <Text key={i} style={styles.body}>
              <Spans spans={b.spans} />
            </Text>
          );
        }
        // list
        return (
          <View key={i} style={styles.list}>
            {b.items.map((item, j) => (
              <View key={j} style={styles.listItem}>
                <Text style={styles.bullet}>{b.ordered ? `${j + 1}.` : "•"}</Text>
                <Text style={[styles.body, styles.listText]}>
                  <Spans spans={item} />
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  // Título del plato: serif itálico teal (mockup B elegido por Andy).
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodyLg + 2,
    color: colors.teal,
  },
  body: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    lineHeight: fontSizes.body * 1.6,
  },
  bold: { fontFamily: fonts.serifMedium, fontWeight: "600" },
  italic: { fontFamily: fonts.serifItalic },
  qty: { color: colors.terracota, fontWeight: "700" },
  list: { gap: spacing.xs },
  listItem: { flexDirection: "row", gap: spacing.sm },
  bullet: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifBody,
    color: colors.terracota,
    lineHeight: fontSizes.body * 1.6,
  },
  listText: { flex: 1 },
});
