// Design tokens. Source of truth: brief v4 sec. 13 + project/styles.css :root.

import { Platform } from "react-native";

// Bloque 4 · C-02 — Crimson Pro como serif única (iOS + Android).
// Cargada en app/_layout.tsx vía expo-font + @expo-google-fonts/crimson-pro.
// En RN las variantes italic/medium no se resuelven por `fontStyle`/`fontWeight`
// con fuentes custom: hay que apuntar al fontFamily exacto del peso/estilo.

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
  // Crimson Pro — 4 variantes cargadas en _layout.tsx.
  serif: "CrimsonPro_400Regular",
  serifItalic: "CrimsonPro_400Regular_Italic",
  serifMedium: "CrimsonPro_500Medium",
  serifMediumItalic: "CrimsonPro_500Medium_Italic",
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

  // Bloque 4 · C-02 — escala serif propia.
  // Crimson Pro tiene x-height más baja que la system serif anterior; para
  // mantener altura visible al ojo, los escalones chicos/medianos viajan
  // ~+2px y los grandes apenas +1 (los grandes ya rinden bien).
  serifBodySm: 15.5, // antes 12.5 (sans) +3 — meta serif chico
  serifBody: 17, // antes 14 (sans) +3 — cuerpo de receta, nombres de tarjeta
  serifBodyLg: 18, // antes 15 (sans) +3 — títulos de plato en bubble asistente
  serifMd: 20, // antes 18
  serifLg: 23, // antes 22
  serifXl: 28, // sin cambio — titulares grandes
  serifDisplay: 36, // sin cambio
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
