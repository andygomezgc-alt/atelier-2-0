import type { RenderInput } from "./templates";

/** Una segunda carta comprueba que el diseño sea reutilizable, no una maqueta fija. */
export function themeStressInput(base: RenderInput): RenderInput {
  return {
    ...base,
    restaurantName: "Restaurante de prueba — Cocina de temporada",
    menuName: "Carta de temporada / Seasonal menu",
    season: null,
    showAllergensInPdf: false,
    sections: Array.from({ length: 6 }, (_, section) => ({
      name: `Sección ${section + 1} — Especialidades de temporada`,
      dishes: Array.from({ length: 4 }, (_, dish) => ({
        name: `Plato ${section + 1}.${dish + 1} — Verduras asadas con crema de almendras`,
        description: "Ingredientes de temporada, hierbas frescas y aceite de oliva. Seasonal vegetables and fresh herbs.",
        price: 1250 + dish * 100,
        allergens: [],
      })),
    })),
    unsectioned: [{ name: "Especial fuera de sección", description: "", price: 0, allergens: [] }],
    serviceCharges: [],
  };
}

export function requiredMenuContent(input: RenderInput): string[] {
  return [
    ...input.sections.flatMap(section => section.dishes.length ? [section.name, ...section.dishes.map(dish => dish.name)] : []),
    ...input.unsectioned.map(dish => dish.name),
    ...(input.serviceCharges ?? []).map(dish => dish.name),
  ];
}
