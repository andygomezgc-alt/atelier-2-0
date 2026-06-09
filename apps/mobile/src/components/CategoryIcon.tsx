// Ícono de categoría para el Banco de Productos.
//
// Color por categoría — tonos tierra discretos, NO primarios saturados, para
// que la lista del banco se escanee visualmente sin parecer un dashboard
// chillón. Los Ionicons elegidos son outline (delgados) y razonablemente
// universales; donde no hay icono ideal en Ionicons (carne, lácteo) elijo
// el más cercano semánticamente.

import { Ionicons } from "@expo/vector-icons";
import type { ProductCategory } from "@atelier/shared";

// Pares (icono, color) en una sola fuente de verdad. Si querés ajustar
// paleta o iconos, todo está acá.
type Spec = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
};

const SPEC: Record<ProductCategory, Spec> = {
  pescado:        { icon: "fish-outline",         color: "#4a7a8a" }, // azul acero
  carne:          { icon: "restaurant-outline",   color: "#a45a4a" }, // rojo apagado
  verdura:        { icon: "leaf-outline",         color: "#6b8e4f" }, // verde salvia
  fruta:          { icon: "nutrition-outline",    color: "#c47e4f" }, // terracota
  lacteo:         { icon: "water-outline",        color: "#a8a08a" }, // beige frío
  panaderia:      { icon: "pizza-outline",        color: "#b89a6e" }, // tostado cálido
  seco:           { icon: "cube-outline",         color: "#8b6f4a" }, // marrón
  especia:        { icon: "sparkles-outline",     color: "#b8624a" }, // óxido
  hierba:         { icon: "leaf-outline",         color: "#8ba36b" }, // verde olivo claro
  vinagre_aceite: { icon: "flask-outline",        color: "#a8995a" }, // amarillo oliva
  otro:           { icon: "apps-outline",         color: "#8b7a6f" }, // mute
};

type Props = {
  category: ProductCategory;
  size?: number;
};

export function CategoryIcon({ category, size = 14 }: Props) {
  const spec = SPEC[category];
  return <Ionicons name={spec.icon} size={size} color={spec.color} />;
}

// Exportado para casos donde solo querés el color (por ej. un dot fallback).
export function categoryColor(category: ProductCategory): string {
  return SPEC[category].color;
}
