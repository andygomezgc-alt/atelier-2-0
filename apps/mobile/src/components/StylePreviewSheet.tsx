// "Tu estilo" — sheet "Así quedó tu estilo": mini-carta RN que aproxima el
// theme extraído (mismos 12 tokens que arma el PDF real vía themeFromSpec en
// apps/api/lib/pdf/templates.ts). Se abre solo al terminar la extracción, y
// se reabre tocando el chip "custom" ya activo (ver menus/[id].tsx).
//
// La mini-carta es SOLO una aproximación visual (RN no puede reproducir el
// CSS exacto del PDF) — por eso el aviso "Vista aproximada" y el botón para
// ver el PDF real.

import { StyleSheet, Text, View } from "react-native";
import type { MenuStyleSpec } from "@atelier/shared";
import { useI18n } from "@/src/hooks/useI18n";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { legibleOn, titlePxFromPt } from "@/src/lib/style-preview";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  spec: MenuStyleSpec | null;
  exporting?: boolean;
  onClose: () => void;
  onViewPdf: () => void;
};

export function StylePreviewSheet({ open, spec, exporting, onClose, onViewPdf }: Props) {
  const { t } = useI18n();

  // Defensivo: si por lo que sea no hay spec (no debería pasar — el sheet
  // solo se abre con un spec en mano), sheet vacío en vez de crashear.
  // `children` es requerido por BottomSheet — `null` es un hijo válido.
  if (!spec) return <BottomSheet open={open} onClose={onClose}>{null}</BottomSheet>;

  const headingColor = legibleOn(spec.bgColor, spec.headingColor);
  const inkColor = legibleOn(spec.bgColor, spec.inkColor);
  const accentColor = legibleOn(spec.bgColor, spec.accentColor);
  const dishNameFont = spec.fontCategory === "serif" ? fonts.serif : fonts.sans;

  const titleFontFamily =
    spec.fontCategory === "serif"
      ? spec.titleItalic
        ? fonts.serifItalic
        : fonts.serif
      : fonts.sans;

  const dishes = [
    {
      name: t("style_preview_dish1_name"),
      desc: t("style_preview_dish1_desc"),
      price: "12",
    },
    {
      name: t("style_preview_dish2_name"),
      desc: t("style_preview_dish2_desc"),
      price: "16",
    },
    {
      name: t("style_preview_dish3_name"),
      desc: t("style_preview_dish3_desc"),
      price: "7",
    },
  ];

  const dividerAlign =
    spec.dividerStyle === "full-hairline"
      ? "stretch"
      : spec.titleAlign === "center"
        ? "center"
        : "flex-start";
  const dividerDims =
    spec.dividerStyle === "accent-rule"
      ? { width: 48, height: 1 }
      : spec.dividerStyle === "underline"
        ? { width: 72, height: 2 }
        : spec.dividerStyle === "full-hairline"
          ? { height: StyleSheet.hairlineWidth }
          : null;

  function renderDish(dish: (typeof dishes)[number], isLast: boolean) {
    if (spec!.dishLayout === "stack") {
      return (
        <View
          key={dish.name}
          style={[
            styles.dishStack,
            !isLast && { borderBottomWidth: 1, borderStyle: "dotted", borderBottomColor: accentColor },
          ]}
        >
          <Text style={{ fontFamily: dishNameFont, fontSize: 14, color: headingColor }}>
            {dish.name}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: inkColor, marginTop: 2 }}>
            {dish.desc}
          </Text>
          <Text
            style={{ fontFamily: fonts.sans, fontSize: 12, fontWeight: "600", color: accentColor, marginTop: 4 }}
          >
            {dish.price}
          </Text>
        </View>
      );
    }
    // "row" y "grid" comparten el layout fila nombre/desc + precio a la
    // derecha; solo cambia el tamaño del nombre y el numeric variant del precio.
    const isGrid = spec!.dishLayout === "grid";
    return (
      <View key={dish.name} style={styles.dishRow}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: dishNameFont,
              fontSize: isGrid ? 12 : 14,
              fontWeight: isGrid ? "500" : "400",
              color: headingColor,
            }}
          >
            {dish.name}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: inkColor, marginTop: 2 }}>
            {dish.desc}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: 14,
            color: accentColor,
            ...(isGrid ? { fontVariant: ["tabular-nums" as const] } : {}),
          }}
        >
          {dish.price}
        </Text>
      </View>
    );
  }

  const miniCarta = (
    <View style={[styles.card, { backgroundColor: spec.bgColor }]}>
      <Text
        style={{
          fontFamily: titleFontFamily,
          ...(spec.fontCategory === "sans" && spec.titleItalic ? { fontStyle: "italic" as const } : {}),
          color: headingColor,
          textAlign: spec.titleAlign,
          fontSize: titlePxFromPt(spec.titleSizePt),
        }}
      >
        {t("style_preview_sample_menu")}
      </Text>
      {dividerDims ? (
        <View
          style={[
            styles.divider,
            dividerDims,
            { alignSelf: dividerAlign as "center" | "flex-start" | "stretch", backgroundColor: accentColor },
          ]}
        />
      ) : null}
      <Text
        style={{
          color: accentColor,
          fontSize: spec.sectionCase === "uppercase" ? 11 : 10,
          letterSpacing: spec.sectionCase === "uppercase" ? 3 : 2.5,
          textTransform: "uppercase",
          marginTop: spec.dividerStyle === "none" ? spacing.sm : 0,
          marginBottom: spacing.xs,
        }}
      >
        {t("style_preview_sample_section")}
      </Text>
      {dishes.map((d, i) => renderDish(d, i === dishes.length - 1))}
    </View>
  );

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.title}>{t("style_preview_title")}</Text>
      <View style={styles.scrollContent}>
        {spec.frame === "double" ? (
          <View style={[styles.doubleFrameOuter, { borderColor: spec.accentColor }]}>
            <View style={[styles.doubleFrameInner, { borderColor: spec.accentColor }]}>{miniCarta}</View>
          </View>
        ) : spec.frame === "single" ? (
          <View style={[styles.singleFrame, { borderColor: spec.accentColor }]}>{miniCarta}</View>
        ) : (
          miniCarta
        )}
        <Text style={styles.note}>{t("style_preview_note")}</Text>
      </View>
      <View style={styles.footer}>
        <Button
          label={exporting ? "…" : t("style_preview_view_pdf")}
          iconLeft="document-text-outline"
          onPress={onViewPdf}
          disabled={exporting}
        />
        <Button label={t("style_preview_close")} variant="secondary" onPress={onClose} />
      </View>
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
  scrollContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  card: {
    borderRadius: radii.md,
    padding: spacing.xl,
  },
  singleFrame: {
    borderWidth: 1,
    borderRadius: radii.md,
  },
  doubleFrameOuter: {
    borderWidth: 1,
    borderRadius: radii.md,
  },
  doubleFrameInner: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 3,
  },
  dishRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  dishStack: {
    marginTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  divider: {
    marginVertical: spacing.sm,
  },
  note: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
});
