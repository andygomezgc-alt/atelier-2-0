// Styles of the assistant screen and its components (moved out of app/(tabs)/asistente.tsx in A12).
import { StyleSheet } from "react-native";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },

  // ── Header del mockup ───────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerLeft: { flex: 1, gap: 4 },
  headerEyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    letterSpacing: 1.4,
  },
  headerGreet: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifXl,
    color: colors.ink,
    lineHeight: fontSizes.serifXl * 1.2,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chatActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  newChatPill: { backgroundColor: colors.teal, borderColor: colors.teal },
  newChatLabel: { color: colors.paper },
  actionDimmed: { opacity: 0.5 },
  historyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.pill,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  historyLabel: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodySm,
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
  avatarImg: { width: 32, height: 32, borderRadius: 16 },
  avatarText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: "600",
    color: colors.paper,
    letterSpacing: 0.5,
  },
  divider: {
    height: 0.5,
    backgroundColor: colors.edge,
    marginHorizontal: spacing.xl,
  },

  // ── Idea anclada (chip) ─────────────────────────────────────────────
  // Bloque 4 · C-03 — el chip es afirmación pasiva (la idea ya se ancló al
  // chat, no hay que tomar acción): superficie neutra de papel cálido con
  // filete, sin color de acción. Sobre tealSoft el rótulo teal y el texto en
  // tinta no se leían (contraste < 2:1); sobre papel cálido superan 10:1.
  pinChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.paperWarm,
    borderWidth: 0.5,
    borderColor: colors.edge,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderRadius: radii.md,
  },
  pinIcon: { marginTop: 2 },
  pinTextWrap: { flex: 1, flexShrink: 1 },
  pinLabel: {
    fontFamily: fonts.sans,
    fontSize: 10.5,
    color: colors.teal,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  pinText: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodySm,
    color: colors.ink,
    lineHeight: fontSizes.bodySm * 1.4,
  },

  // ── Chips de modelo (Sous-chef / Creativo / Ejecutivo) ──────────────
  modelRow: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  modelChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paper,
  },
  modelChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  modelLabel: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.inkSoft },
  modelLabelActive: { color: colors.paper, fontWeight: "600" },

  // ── Messages container ──────────────────────────────────────────────
  messages: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    // Pulido (spec 2026-06-23): más aire entre mensajes.
    gap: 28,
  },

  // ── Separador de día (chip discreto al tope de la conversación) ──────
  daySep: { alignItems: "center", marginBottom: spacing.lg, marginTop: spacing.xs },
  dayChip: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    backgroundColor: colors.paperWarm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    overflow: "hidden",
  },

  // ── Bubble del chef (verde teal, derecha, hora abajo) ───────────────
  userWrap: { alignItems: "flex-end", gap: 4 },
  userBubble: {
    backgroundColor: colors.teal,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    maxWidth: "85%",
  },
  userText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.paper,
    lineHeight: fontSizes.body * 1.5,
  },
  userTime: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginRight: spacing.xs,
  },

  // ── Bubble del asistente (eyebrow + regla + body) ───────────────────
  assistantWrap: { alignItems: "flex-start", gap: spacing.xs },
  assistantEyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    letterSpacing: 1.4,
    paddingHorizontal: spacing.xs,
  },
  // ── Mensaje del asistente: cuaderno editorial (sin tarjeta) ──────────
  assistantRule: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.terracota,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  assistantBody: {
    maxWidth: "94%",
  },

  // ── Error banner ────────────────────────────────────────────────────
  errorBanner: {
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  errorText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.ink,
    lineHeight: fontSizes.bodySm * 1.5,
  },
  errorActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: spacing.sm },
  errorAction: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.terracota,
  },
  errorActionLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    fontWeight: "600",
  },

  // ── Save action ────────────────────────────────────────────────────
  saveStack: { alignItems: "center", gap: 4, marginBottom: spacing.sm },
  saveAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.terracota,
  },
  saveActionLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.paper,
    fontWeight: "600",
  },
  saveHint: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },

  // ── Composer (input redondeado grande + botón terracota; SIN mic) ──
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
    backgroundColor: colors.paper,
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    maxHeight: 120,
  },

  // ── Micrófono (dictado por voz) ─────────────────────────────────────
  micBtn: {
    // Objetivo táctil mínimo recomendado 44px (accesibilidad). Antes 38.
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.terracota,
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnActive: { backgroundColor: colors.terracota, borderColor: colors.terracota },
  micBtnDisabled: { opacity: 0.4 },
  // A13 — the Stop control shown in place of Send while a turn runs.
  stopBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink },
  stopBtnDisabled: { opacity: 0.5 },
  // Visually hidden, still read by screen readers (the live region of the streaming bubble).
  srOnly: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  // A13b — the status shown in place of the writing dots while an interrupted answer is recovered.
  recoveringStatus: { paddingVertical: spacing.sm },
  recoveringText: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
});
