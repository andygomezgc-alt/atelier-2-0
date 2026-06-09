// Icono por alérgeno — Reg. EU 1169/2011.
//
// Source of truth del mapeo allergen → icon. Lo usa:
//   - Fase 2: la preview de menú (ExportPreviewSheet bajo cada plato y la
//     leyenda al pie).
//   - Fase 4: el MenuAllergenPickerSheet (panel del "+").
//
// **3 fuentes (@expo/vector-icons)**: Ionicons donde funciona, MCI y FA6
// donde tiene mejores símbolos específicos de comida. Andy validó esta
// combinación tras notar que Ionicons solo no alcanza (sin shrimp, sin
// shell, sin wheat). El PDF (apps/api/lib/pdf/templates.ts) refleja el mismo
// concepto con SVG inline custom — mismo símbolo conceptual en ambos lados
// para coherencia app↔PDF.

import { Ionicons, MaterialCommunityIcons, FontAwesome6 } from "@expo/vector-icons";
import { View } from "react-native";
import Svg, { Path, Circle, Ellipse } from "react-native-svg";
import type { ComponentProps } from "react";
import type { Allergen } from "@atelier/shared";
import { colors } from "@/src/theme";

type IconSpec =
  | { lib: "ionicons"; name: ComponentProps<typeof Ionicons>["name"] }
  | { lib: "mci"; name: ComponentProps<typeof MaterialCommunityIcons>["name"] }
  | { lib: "fa6"; name: ComponentProps<typeof FontAwesome6>["name"] }
  // SVG inline custom — para los alérgenos donde ninguna de las fuentes
  // vector tiene un glyph disponible. Hoy: molluscs (pulpo). FA6
  // "cuttlefish" existe en el glyphmap JSON pero NO en el TTF bundled, y
  // el emoji 🐙 sale en color (rompe coherencia con el resto de iconos
  // monocromos). Usamos react-native-svg para dibujar el mismo pulpo que
  // el PDF, en gris monocromo igual que los demás.
  | { lib: "svg"; render: (size: number, color: string) => React.ReactElement };

// Decisiones (validadas con Andy):
//   - gluten = espiga de trigo (FA6 wheat-awn) — símbolo universal.
//   - crustaceans / fish / molluscs son 3 alérgenos DISTINTOS — camarón,
//     pez, caracol son visualmente inconfundibles.
//   - milk = botella con gota (FA6) — claramente líquido envasado, no
//     ambiguo (la gota sola se confundía con aceite/agua).
//   - celery = puerro (MCI leek) — tallos verticales, distinto de la hoja
//     de soja que es la que confundía.
//   - lupin = vaina/semilla (MCI seed-outline) — legumbre.
//   - peanuts = cacahuete con cintura (MCI peanut-outline).
//   - molluscs = cefalópodo (FA6 cuttlefish) — cuerpo + tentáculos, claramente
//     animal marino. Decisión Andy: pulpo/vieira sobre caracol. FA6Free no
//     tiene octopus ni scallop específicos; cuttlefish es el cefalópodo
//     disponible más cercano (mismo grupo zoológico que pulpo).
//   - los 7 que Andy validó como buenos quedan como estaban (Ionicons).
const ICONS: Record<Allergen, IconSpec> = {
  // 7 cambiados
  gluten: { lib: "fa6", name: "wheat-awn" },
  crustaceans: { lib: "fa6", name: "shrimp" },
  peanuts: { lib: "mci", name: "peanut-outline" },
  milk: { lib: "fa6", name: "bottle-droplet" },
  celery: { lib: "mci", name: "leek" },
  lupin: { lib: "mci", name: "seed-outline" },
  // Pulpo — SVG inline (mismo path conceptual que el PDF). Silueta pura
  // line-icon (cabeza + tentáculos, sin ojos rellenos) para mantener el
  // mismo estilo monocromo que los demás iconos: stroke gris, fill=none.
  molluscs: {
    lib: "svg",
    render: (size, color) => (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <Ellipse cx={12} cy={8} rx={5} ry={4} />
        <Path d="M8 12c-.5 2-2 4-3 5" />
        <Path d="M10 12c-.5 3-.5 6 0 8" />
        <Path d="M14 12c.5 3 .5 6 0 8" />
        <Path d="M16 12c.5 2 2 4 3 5" />
      </Svg>
    ),
  },
  // 7 mantenidos (Andy aprobó)
  eggs: { lib: "ionicons", name: "egg-outline" },
  fish: { lib: "ionicons", name: "fish-outline" },
  soy: { lib: "ionicons", name: "leaf-outline" },
  tree_nuts: { lib: "ionicons", name: "ellipse-outline" },
  mustard: { lib: "ionicons", name: "flask-outline" },
  sesame: { lib: "ionicons", name: "ellipsis-horizontal-outline" },
  sulphites: { lib: "ionicons", name: "wine-outline" },
};

export type AllergenIconProps = {
  allergen: Allergen;
  size?: number;
  color?: string;
};

// Icono sutil en gris (`colors.mute`) por default. Tamaños sugeridos:
//   - lista del banco: 12 (no usado actualmente)
//   - preview de menú bajo el plato: 16
//   - sheet de selección: 16
//   - leyenda al pie del PDF cliente: 13
export function AllergenIcon({ allergen, size = 14, color }: AllergenIconProps) {
  const spec = ICONS[allergen];
  const c = color ?? colors.mute;
  if (spec.lib === "ionicons") {
    return <Ionicons name={spec.name} size={size} color={c} />;
  }
  if (spec.lib === "mci") {
    return <MaterialCommunityIcons name={spec.name} size={size} color={c} />;
  }
  if (spec.lib === "fa6") {
    return <FontAwesome6 name={spec.name} size={size} color={c} />;
  }
  // svg: render custom monocromo. El render callback recibe size + color
  // resueltos. Mismo símbolo conceptual que el SVG del PDF.
  return spec.render(size, c);
}

// Versión envuelta en View con padding mínimo. Útil cuando hay que medir el
// hit-area por separado.
export function AllergenIconBox({ allergen, size = 14, color }: AllergenIconProps) {
  return (
    <View style={{ paddingHorizontal: 2 }}>
      <AllergenIcon allergen={allergen} size={size} color={color} />
    </View>
  );
}
