// Ícono de categoría para el Banco de Productos.
//
// Color por categoría — tonos tierra discretos, NO primarios saturados, para
// que la lista del banco se escanee visualmente sin parecer un dashboard
// chillón. Los Ionicons elegidos son outline (delgados) y razonablemente
// universales; donde no hay icono ideal en Ionicons (carne, lácteo) elijo
// el más cercano semánticamente.

import { Ionicons } from "@expo/vector-icons";
import type { ProductCategory } from "@atelier/shared";
import { categoryColors } from "@/src/theme";

// One icon per category; the colours live in the theme (`categoryColors`).
const ICON: Record<ProductCategory, React.ComponentProps<typeof Ionicons>["name"]> = {
  pescado: "fish-outline",
  carne: "restaurant-outline",
  verdura: "leaf-outline",
  fruta: "nutrition-outline",
  lacteo: "water-outline",
  panaderia: "pizza-outline",
  seco: "cube-outline",
  especia: "sparkles-outline",
  hierba: "leaf-outline",
  vinagre_aceite: "flask-outline",
  otro: "apps-outline",
};

type Props = {
  category: ProductCategory;
  size?: number;
};

export function CategoryIcon({ category, size = 14 }: Props) {
  return <Ionicons name={ICON[category]} size={size} color={categoryColors[category]} />;
}
