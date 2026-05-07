// Design tokens. Source of truth: brief v4 sec. 13 + project/styles.css :root.

import { Platform } from "react-native";

export const colors = {
  paper: "#f9f7f2",
  paperSoft: "#fffaf2",
  paperWarm: "#f4ede0",
  teal: "#1a3a3a",
  tealSoft: "#2a4a4a",
  terracota: "#c47e4f",
  terracotaSoft: "#d99a6e",
  ink: "#2a2520",
  inkSoft: "#4a4036",
  mute: "#8b7a6f",
  edge: "#e0d8c8",
  edgeSoft: "#ede6d6",
  danger: "#a45a4a",
} as const;

export const fonts = {
  serif: Platform.select({
    ios: "Iowan Old Style",
    android: "serif", // RN Android can't load Iowan; falls back to system serif (resembles Georgia).
    default: "serif",
  }) as string,
  sans: Platform.select({
    ios: "System",
    android: "sans-serif",
    default: "System",
  }) as string,
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }) as string,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 22,
  pill: 999,
} as const;

export const fontSizes = {
  // Sans body (system).
  micro: 10,
  eyebrow: 10.5,
  caption: 11,
  bodySm: 12.5,
  body: 14,
  bodyLg: 15,

  // Serif headings.
  serifMd: 18,
  serifLg: 22,
  serifXl: 28,
  serifDisplay: 36,
} as const;

export const lineHeights = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.55,
} as const;

export const letterSpacing = {
  eyebrow: 1.4, // ~0.12em on 11px
  caps: 0.6,
} as const;

export type Theme = {
  colors: typeof colors;
  fonts: typeof fonts;
  spacing: typeof spacing;
  radii: typeof radii;
  fontSizes: typeof fontSizes;
  lineHeights: typeof lineHeights;
  letterSpacing: typeof letterSpacing;
};

export const theme: Theme = {
  colors,
  fonts,
  spacing,
  radii,
  fontSizes,
  lineHeights,
  letterSpacing,
};
