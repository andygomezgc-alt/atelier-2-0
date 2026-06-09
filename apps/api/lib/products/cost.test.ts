import { describe, expect, it } from "vitest";
import {
  computeRecipeCost,
  type RecipeIngredientForCost,
} from "./cost";

// Helper para construir un ingrediente con defaults sensatos. Cada test
// solo override lo que importa para el caso.
function ing(
  overrides: Partial<RecipeIngredientForCost> & {
    productOverrides?: Partial<NonNullable<RecipeIngredientForCost["product"]>>;
  },
): RecipeIngredientForCost {
  const { productOverrides, ...rest } = overrides;
  const baseProduct = productOverrides === null
    ? null
    : {
        precioCompra: 1000,
        mermaPct: 0,
        unidadCompra: "kg" as const,
        pezzaturaMode: null,
        pezzaturaMin: null,
        pezzaturaMax: null,
        ...productOverrides,
      };
  return {
    qty: 1,
    unit: "kg",
    mermaOverridePct: null,
    pesoCalculoG: null,
    product: baseProduct,
    ...rest,
  };
}

describe("computeRecipeCost — caso peso/peso (sin cambios)", () => {
  it("recipe kg + producto kg + merma 0 → cost directo", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 2,
          unit: "kg",
          productOverrides: { precioCompra: 1000, mermaPct: 0, unidadCompra: "kg" },
        }),
      ],
      portions: 1,
      salePriceCents: null,
    });
    expect(r.totalCents).toBe(2000);
    expect(r.computableCount).toBe(1);
    expect(r.wideRangeCount).toBe(0);
  });

  it("recipe g + producto kg + merma 50% → conversión + merma", () => {
    // 200 g = 0.2 kg. realCost = 1000 / (1 - 0.5) = 2000 cent/kg.
    // Costo = 0.2 × 2000 = 400 cent.
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 200,
          unit: "g",
          productOverrides: { precioCompra: 1000, mermaPct: 50, unidadCompra: "kg" },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.totalCents).toBe(400);
  });
});

describe("computeRecipeCost — pezzatura: recipe piezas, producto kg", () => {
  it("Gamberi 15/20 (pz_per_kg) × 4 piezas a €85/kg sin merma", () => {
    // punto medio = 17.5 pz/kg → 1000/17.5 = 57.142... g/pz.
    // peso total = 4 × 57.142 = 228.57 g = 0.22857 kg.
    // costo = 0.22857 × 8500 = 1942.86 → redondeado 1943.
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 4,
          unit: "piezas",
          productOverrides: {
            precioCompra: 8500,
            mermaPct: 50, // merma alta para ver que NO se aplica
            unidadCompra: "kg",
            pezzaturaMode: "pz_per_kg",
            pezzaturaMin: 15,
            pezzaturaMax: 20,
          },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.totalCents).toBe(1943);
    expect(r.computableCount).toBe(1);
    expect(r.wideRangeCount).toBe(0);
  });

  it("Ricciola 4-6 kg (g_per_piece) × 1 pieza a €25/kg sin merma", () => {
    // punto medio = 5000 g/pz. 1 × 5000 = 5000 g = 5 kg.
    // costo = 5 × 2500 = 12500 cent.
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 1,
          unit: "piezas",
          productOverrides: {
            precioCompra: 2500,
            mermaPct: 40, // merma alta — NO se aplica en unit=piezas
            unidadCompra: "kg",
            pezzaturaMode: "g_per_piece",
            pezzaturaMin: 4000,
            pezzaturaMax: 6000,
          },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.totalCents).toBe(12500);
  });

  it("pesoCalculoG override gana sobre el banco. El override es el PESO BRUTO de la pieza entera (antes de pelar/limpiar) — si el chef quiere considerar el peso útil ajusta la merma del producto, no este override.", () => {
    // override = 70 g/pz, qty = 4 → peso total = 280 g.
    // precio 8500 €/kg en centavos → 0.280 × 8500 = 2380 cent.
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 4,
          unit: "piezas",
          pesoCalculoG: 70,
          productOverrides: {
            precioCompra: 8500,
            mermaPct: 0,
            unidadCompra: "kg",
            pezzaturaMode: "pz_per_kg",
            pezzaturaMin: 15,
            pezzaturaMax: 20, // se ignora porque hay override
          },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.totalCents).toBe(2380);
  });

  it("sin pezzatura ni override → unmeasured", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 4,
          unit: "piezas",
          productOverrides: {
            precioCompra: 8500,
            unidadCompra: "kg",
            pezzaturaMode: null,
            pezzaturaMin: null,
            pezzaturaMax: null,
          },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.totalCents).toBe(null);
    expect(r.unmeasuredCount).toBe(1);
    expect(r.computableCount).toBe(0);
  });
});

describe("computeRecipeCost — pezzatura: recipe piezas, producto unidad", () => {
  it("pichón compra=unidad × 2 piezas → qty × precio sin merma", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 2,
          unit: "piezas",
          productOverrides: {
            precioCompra: 1200,
            mermaPct: 30, // merma alta — NO se aplica
            unidadCompra: "unidad",
            pezzaturaMode: "g_per_piece",
            pezzaturaMin: 450,
            pezzaturaMax: 450,
          },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.totalCents).toBe(2400);
  });
});

describe("computeRecipeCost — pezzatura: recipe gramos, producto unidad", () => {
  it("compra unidad (450g/pz a €12) + receta usa 900g → 2 piezas necesarias", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 900,
          unit: "g",
          productOverrides: {
            precioCompra: 1200,
            mermaPct: 0,
            unidadCompra: "unidad",
            pezzaturaMode: "g_per_piece",
            pezzaturaMin: 450,
            pezzaturaMax: 450,
          },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.totalCents).toBe(2400);
  });
});

describe("computeRecipeCost — warnings", () => {
  it("rango ancho (max/min > 2) sin override → wideRangeCount + warning idx", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 1,
          unit: "piezas",
          productOverrides: {
            precioCompra: 2500,
            mermaPct: 0,
            unidadCompra: "kg",
            pezzaturaMode: "g_per_piece",
            pezzaturaMin: 2000,
            pezzaturaMax: 8000, // ratio 4 > 2
          },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.wideRangeCount).toBe(1);
    expect(r.warningsByIdx.get(0)).toBe("wide_range");
    // Costo igualmente computado con punto medio (5000g = 5kg × €25 = €125).
    expect(r.totalCents).toBe(12500);
  });

  it("rango ancho PERO con override pesoCalculoG → no hay warning", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 1,
          unit: "piezas",
          pesoCalculoG: 3000,
          productOverrides: {
            precioCompra: 2500,
            mermaPct: 0,
            unidadCompra: "kg",
            pezzaturaMode: "g_per_piece",
            pezzaturaMin: 2000,
            pezzaturaMax: 8000,
          },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.wideRangeCount).toBe(0);
    expect(r.warningsByIdx.size).toBe(0);
    // 3000 g × €25/kg = €75.
    expect(r.totalCents).toBe(7500);
  });
});

describe("computeRecipeCost — buckets", () => {
  it("ingrediente sin producto enlazado → unlinkedCount", () => {
    const r = computeRecipeCost({
      ingredients: [{ qty: 1, unit: "kg", mermaOverridePct: null, pesoCalculoG: null, product: null }],
      portions: null,
      salePriceCents: null,
    });
    expect(r.unlinkedCount).toBe(1);
    expect(r.totalCents).toBe(null);
  });

  it("producto con precio 0 → missingPriceCount", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 1,
          unit: "kg",
          productOverrides: { precioCompra: 0 },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.missingPriceCount).toBe(1);
  });

  it("portions + salePrice → perPortion + foodCostPct", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 1,
          unit: "kg",
          productOverrides: { precioCompra: 1000, mermaPct: 0, unidadCompra: "kg" },
        }),
      ],
      portions: 4,
      salePriceCents: 4000,
    });
    expect(r.totalCents).toBe(1000);
    expect(r.perPortionCents).toBe(250);
    expect(r.foodCostPct).toBe(25);
  });
});
