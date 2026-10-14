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

describe("cost audit regressions", () => {
  it("no calcula coste por ración ni porcentaje sin porciones", () => {
    const r = computeRecipeCost({ ingredients: [ing({})], portions: null, salePriceCents: 2000 });
    expect(r.totalCents).toBe(1000);
    expect(r.perPortionCents).toBeNull();
    expect(r.foodCostPct).toBeNull();
  });
  it("marca el coste parcial y no publica un porcentaje incompleto", () => {
    const r = computeRecipeCost({ ingredients: [ing({}), ing({ product: null })], portions: 2, salePriceCents: 2000 });
    expect(r.totalCents).toBe(1000);
    expect(r.status).toBe("partial");
    expect(r.foodCostPct).toBeNull();
  });
  it("un rendimiento cero no produce un coste finito de ingrediente", () => {
    const r = computeRecipeCost({ ingredients: [ing({ productOverrides: { mermaPct: 100 } })], portions: 1, salePriceCents: 2000 });
    expect(r.totalCents).toBeNull();
    expect(r.unmeasuredCount).toBe(1);
  });
  it.each(["l", "ml", "caja"] as const)("does not convert pieces to %s from weight", (unit) => {
    const r = computeRecipeCost({ ingredients: [ing({ qty: 2, unit: "piezas", pesoCalculoG: 100, productOverrides: { unidadCompra: unit } })], portions: 1, salePriceCents: null });
    expect(r.totalCents).toBeNull();
    expect(r.unmeasuredCount).toBe(1);
  });
  it.each(["l", "ml", "caja", "cucharada"])("does not treat %s as grams", (unit) => {
    const r = computeRecipeCost({ ingredients: [ing({ qty: 100, unit, pesoCalculoG: 100, productOverrides: { unidadCompra: "unidad" } })], portions: 1, salePriceCents: null });
    expect(r.totalCents).toBeNull();
  });
  it("keeps fractional cents until the recipe total", () => {
    const r = computeRecipeCost({ ingredients: [ing({ qty: 1000, unit: "g", productOverrides: { unidadCompra: "g", precioCompra: 1, mermaPct: 20 } })], portions: 4, salePriceCents: 1000 });
    expect(r.totalCents).toBe(1250);
    expect(r.perPortionCents).toBe(313);
    expect(r.foodCostPct).toBe(31);
  });
});

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

  it("portions + salePrice → perPortion + foodCostPct (food cost POR RACIÓN)", () => {
    // Ejemplo canónico de la decisión de producto: receta de 4 porciones,
    // coste total 20€ (2000c), PVP POR RACIÓN 10€ (1000c).
    // Coste por ración = 2000/4 = 500c (5€). Food cost = 5€/10€ = 50%.
    // Base: totalCents/(portions*salePriceCents) = 2000/(4*1000) = 0,5 → 50%.
    // (Con la fórmula vieja totalCents/salePriceCents daba 2000/1000 = 200%.)
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 2,
          unit: "kg",
          productOverrides: { precioCompra: 1000, mermaPct: 0, unidadCompra: "kg" },
        }),
      ],
      portions: 4,
      salePriceCents: 1000,
    });
    expect(r.totalCents).toBe(2000);
    expect(r.perPortionCents).toBe(500);
    expect(r.foodCostPct).toBe(50);
  });

  it("foodCostPct usa totalCents/(portions*salePrice), no perPortionCents redondeado", () => {
    // total 1000c, 7 porciones, PVP ración 200c.
    // Correcto (sin arrastrar redondeo): 1000/(7*200) = 0,714285 → 71%.
    // Si se calculara desde perPortionCents=round(1000/7)=143 → 143/200 = 71,5 → 72% (mal).
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 1,
          unit: "kg",
          productOverrides: { precioCompra: 1000, mermaPct: 0, unidadCompra: "kg" },
        }),
      ],
      portions: 7,
      salePriceCents: 200,
    });
    expect(r.totalCents).toBe(1000);
    expect(r.perPortionCents).toBe(143);
    expect(r.foodCostPct).toBe(71);
  });
});

describe("computeRecipeCost — weight ↔ volume with gramosPorLitro", () => {
  it("40 g against a product bought by the litre uses the declared weight per litre", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          id: "ri-oil",
          position: 0,
          qty: 40,
          unit: "g",
          productOverrides: { id: "p-oil", unidadCompra: "l", precioCompra: 500, gramosPorLitro: 920 },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    // 40 g / 920 g per litre = 0.0434… l × 500 cents/l ≈ 21.74 cents (unrounded).
    expect(r.costsByIdx.get(0)).toBeCloseTo((40 / 920) * 500, 9);
    expect(r.totalCents).toBe(22);
    expect(r.status).toBe("complete");
    expect(r.unmeasuredCount).toBe(0);
    expect(r.lines).toEqual([
      {
        ingredientId: "ri-oil",
        position: 0,
        status: "ok",
        costCents: 22,
        productId: "p-oil",
        recipeUnit: "g",
        purchaseUnit: "l",
      },
    ]);
  });

  it("applies merma the same way as the weight/volume branch", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 40,
          unit: "g",
          productOverrides: { unidadCompra: "l", precioCompra: 500, mermaPct: 10, gramosPorLitro: 920 },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.costsByIdx.get(0)).toBeCloseTo(((40 / 920) * 500) / 0.9, 9);
    expect(r.totalCents).toBe(24);
  });

  it("0.5 l against a product bought by kg is worth 0.5 kg when 1 l weighs 1000 g", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({
          qty: 0.5,
          unit: "l",
          productOverrides: { unidadCompra: "kg", precioCompra: 1000, gramosPorLitro: 1000 },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.costsByIdx.get(0)).toBeCloseTo(500, 9);
    expect(r.totalCents).toBe(500);
    expect(r.lines[0]?.status).toBe("ok");
  });

  it.each([
    { qty: 40, unit: "g", unidadCompra: "l" as const, gramosPorLitro: 920, purchaseQty: 40 / 920 },
    { qty: 0.04, unit: "kg", unidadCompra: "ml" as const, gramosPorLitro: 920, purchaseQty: (40 / 920) * 1000 },
    { qty: 0.5, unit: "l", unidadCompra: "kg" as const, gramosPorLitro: 1000, purchaseQty: 0.5 },
    { qty: 250, unit: "ml", unidadCompra: "g" as const, gramosPorLitro: 1030, purchaseQty: 257.5 },
  ])("converts $qty $unit into $unidadCompra", ({ qty, unit, unidadCompra, gramosPorLitro, purchaseQty }) => {
    const r = computeRecipeCost({
      ingredients: [ing({ qty, unit, productOverrides: { unidadCompra, precioCompra: 100, gramosPorLitro } })],
      portions: null,
      salePriceCents: null,
    });
    expect(r.costsByIdx.get(0)).toBeCloseTo(purchaseQty * 100, 9);
  });

  it("g against a product by litre without gramosPorLitro → needs_density, unmeasured, contributes nothing", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({ id: "ri-flour", position: 0, qty: 1, unit: "kg" }),
        ing({
          id: "ri-oil",
          position: 1,
          qty: 40,
          unit: "g",
          productOverrides: { id: "p-oil", unidadCompra: "l", precioCompra: 500, gramosPorLitro: null },
        }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.totalCents).toBe(1000);
    expect(r.status).toBe("partial");
    expect(r.computableCount).toBe(1);
    expect(r.unmeasuredCount).toBe(1);
    expect(r.costsByIdx.has(1)).toBe(false);
    expect(r.lines[1]).toEqual({
      ingredientId: "ri-oil",
      position: 1,
      status: "needs_density",
      costCents: null,
      productId: "p-oil",
      recipeUnit: "g",
      purchaseUnit: "l",
    });
  });

  it("l against a product by kg without gramosPorLitro → needs_density", () => {
    const r = computeRecipeCost({
      ingredients: [ing({ qty: 0.5, unit: "l", productOverrides: { unidadCompra: "kg" } })],
      portions: null,
      salePriceCents: null,
    });
    expect(r.lines[0]?.status).toBe("needs_density");
    expect(r.unmeasuredCount).toBe(1);
    expect(r.totalCents).toBeNull();
  });
});

describe("computeRecipeCost — per-ingredient lines", () => {
  function statusOf(ingredient: RecipeIngredientForCost) {
    const r = computeRecipeCost({ ingredients: [ingredient], portions: null, salePriceCents: null });
    expect(r.lines).toHaveLength(1);
    return r.lines[0]!.status;
  }

  it("unlinked ingredient → no_product", () => {
    const r = computeRecipeCost({
      ingredients: [{ id: "ri-1", position: 0, qty: 1, unit: "kg", mermaOverridePct: null, pesoCalculoG: null, product: null }],
      portions: null,
      salePriceCents: null,
    });
    expect(r.lines).toEqual([
      { ingredientId: "ri-1", position: 0, status: "no_product", costCents: null, productId: null, recipeUnit: "kg", purchaseUnit: null },
    ]);
    expect(r.unlinkedCount).toBe(1);
  });

  it("price 0 → no_price", () => {
    expect(statusOf(ing({ productOverrides: { precioCompra: 0 } }))).toBe("no_price");
  });

  it.each([
    { qty: null, unit: "kg" },
    { qty: 0, unit: "kg" },
    { qty: 2, unit: null },
    { qty: 2, unit: "cucharada" },
  ])("qty $qty / unit $unit → no_quantity", ({ qty, unit }) => {
    expect(statusOf(ing({ qty, unit }))).toBe("no_quantity");
  });

  it.each([
    { qty: 3, unit: "unidad", unidadCompra: "l" as const },
    { qty: 3, unit: "piezas", unidadCompra: "ml" as const },
    { qty: 200, unit: "ml", unidadCompra: "unidad" as const },
    { qty: 100, unit: "g", unidadCompra: "caja" as const },
    { qty: 1, unit: "caja", unidadCompra: "kg" as const },
    { qty: 1, unit: "unidad", unidadCompra: "caja" as const },
  ])("$qty $unit against a product by $unidadCompra → incompatible_unit", ({ qty, unit, unidadCompra }) => {
    expect(statusOf(ing({ qty, unit, pesoCalculoG: 100, productOverrides: { unidadCompra, gramosPorLitro: 1000 } }))).toBe(
      "incompatible_unit",
    );
  });

  it("caja against a product by caja is still priced", () => {
    const r = computeRecipeCost({
      ingredients: [ing({ qty: 2, unit: "caja", productOverrides: { unidadCompra: "caja", precioCompra: 1500 } })],
      portions: null,
      salePriceCents: null,
    });
    expect(r.lines[0]?.status).toBe("ok");
    expect(r.totalCents).toBe(3000);
  });

  it("120 g against a product by unidad without piece weight → needs_piece_weight", () => {
    expect(statusOf(ing({ qty: 120, unit: "g", productOverrides: { unidadCompra: "unidad" } }))).toBe("needs_piece_weight");
  });

  it("2 piezas against a product by kg without piece weight → needs_piece_weight", () => {
    expect(statusOf(ing({ qty: 2, unit: "piezas", productOverrides: { unidadCompra: "kg" } }))).toBe("needs_piece_weight");
  });

  it.each([
    { mermaPct: 100, mermaOverridePct: null },
    { mermaPct: 0, mermaOverridePct: 100 },
    { mermaPct: 0, mermaOverridePct: -1 },
  ])("merma $mermaPct / override $mermaOverridePct → invalid_merma", ({ mermaPct, mermaOverridePct }) => {
    expect(statusOf(ing({ mermaOverridePct, productOverrides: { mermaPct } }))).toBe("invalid_merma");
  });

  it("lines follow position order and there is one per ingredient", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({ id: "ri-c", position: 2 }),
        ing({ id: "ri-a", position: 0, product: null }),
        ing({ id: "ri-b", position: 1, productOverrides: { precioCompra: 0 } }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.lines).toHaveLength(3);
    expect(r.lines.map((l) => [l.position, l.ingredientId, l.status])).toEqual([
      [0, "ri-a", "no_product"],
      [1, "ri-b", "no_price"],
      [2, "ri-c", "ok"],
    ]);
  });

  it("keeps the aggregate counters for every bucket", () => {
    const r = computeRecipeCost({
      ingredients: [
        ing({}),
        ing({ product: null }),
        ing({ productOverrides: { precioCompra: 0 } }),
        ing({ qty: null }),
        ing({ qty: 100, unit: "g", productOverrides: { unidadCompra: "caja" } }),
        ing({ qty: 40, unit: "g", productOverrides: { unidadCompra: "l" } }),
        ing({ qty: 120, unit: "g", productOverrides: { unidadCompra: "unidad" } }),
        ing({ productOverrides: { mermaPct: 100 } }),
      ],
      portions: null,
      salePriceCents: null,
    });
    expect(r.lines.map((l) => l.status)).toEqual([
      "ok",
      "no_product",
      "no_price",
      "no_quantity",
      "incompatible_unit",
      "needs_density",
      "needs_piece_weight",
      "invalid_merma",
    ]);
    expect(r.totalIngredients).toBe(8);
    expect(r.computableCount).toBe(1);
    expect(r.unlinkedCount).toBe(1);
    expect(r.missingPriceCount).toBe(1);
    expect(r.unmeasuredCount).toBe(5);
  });

  it("rounds each line for display but sums the unrounded costs for the total", () => {
    // 3 × (1 g at 400 cents/kg) = 3 × 0.4 cents → each line shows 0, total is round(1.2) = 1.
    const r = computeRecipeCost({
      ingredients: [0, 1, 2].map((position) =>
        ing({ id: `ri-${position}`, position, qty: 1, unit: "g", productOverrides: { precioCompra: 400 } }),
      ),
      portions: null,
      salePriceCents: null,
    });
    expect(r.lines.map((l) => l.costCents)).toEqual([0, 0, 0]);
    expect(r.totalCents).toBe(1);
  });

  it("falls back to the input index when a caller passes no ids or positions", () => {
    const r = computeRecipeCost({ ingredients: [ing({}), ing({})], portions: null, salePriceCents: null });
    expect(r.lines.map((l) => [l.ingredientId, l.position])).toEqual([
      ["0", 0],
      ["1", 1],
    ]);
  });
});

describe("purchase tax in recipe cost", () => {
  it("adds the product tax rate to the cost", () => {
    const r = computeRecipeCost({ ingredients: [ing({ productOverrides: { taxRatePct: 10 } })], portions: null, salePriceCents: null });
    expect(r.totalCents).toBeCloseTo(1100);
  });

  it("no rate means no change (existing products)", () => {
    const r = computeRecipeCost({ ingredients: [ing({})], portions: null, salePriceCents: null });
    expect(r.totalCents).toBeCloseTo(1000);
  });

  it("applies tax before waste", () => {
    const r = computeRecipeCost({ ingredients: [ing({ productOverrides: { taxRatePct: 10, mermaPct: 50 } })], portions: null, salePriceCents: null });
    expect(r.totalCents).toBeCloseTo(2200);
  });

  it("taxes products bought by the piece", () => {
    const r = computeRecipeCost({
      ingredients: [ing({ qty: 2, unit: "unidad", productOverrides: { unidadCompra: "unidad", taxRatePct: 22 } })],
      portions: null,
      salePriceCents: null,
    });
    expect(r.totalCents).toBeCloseTo(2440);
  });
});
