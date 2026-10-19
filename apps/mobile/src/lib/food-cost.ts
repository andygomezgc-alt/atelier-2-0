// Food cost health for a dish: most kitchens aim at 30% or less of the sale
// price; above 35% the dish usually eats the margin.
export type FoodCostTone = "good" | "warn" | "high";

export function foodCostTone(pct: number | null | undefined): FoodCostTone | null {
  if (pct == null) return null;
  if (pct <= 30) return "good";
  if (pct <= 35) return "warn";
  return "high";
}
