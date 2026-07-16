import type {
  MeResponse,
  RecipeListItem,
  RecipeDetail,
  MenuListItem,
  MenuDetail,
  IdeaResponse,
  RestaurantResponse,
  ClientOverrides,
  ProductUnit,
  PezzaturaMode,
} from "@atelier/shared";
import { computeRecipeCost } from "./products/cost";
import { computeRecipeAllergens } from "./products/allergens-recipe";
import type { Allergen } from "@atelier/shared";
import { MenuStyleSpecSchema } from "@atelier/shared";

// ─────────── Includes (re-use in Prisma queries) ───────────

export const meSelect = {
  id: true,
  email: true,
  name: true,
  photoUrl: true,
  bio: true,
  role: true,
  languagePref: true,
  defaultModel: true,
  restaurantId: true,
  restaurant: { select: { name: true } },
  customProvider: true,
  customModel: true,
  customApiKey: true,
} as const;

// Include compartido lista/detalle de receta. C-06a: la lista también
// trae los ingredientes con producto para poder computar perPortionCents
// vía computeRecipeCost.
const recipeIngredientsForCostInclude = {
  orderBy: { position: "asc" },
  include: {
    // Para computar el costo necesitamos precioCompra/mermaPct/unidadCompra
    // del producto enlazado.
    // Entrega A.5: + pezzaturaMode/Min/Max para resolver casos
    // unit=piezas vs unidadCompra=kg con el peso por pieza.
    product: {
      select: {
        id: true,
        name: true,
        criticality: true,
        estado: true,
        precioCompra: true,
        mermaPct: true,
        unidadCompra: true,
        pezzaturaMode: true,
        pezzaturaMin: true,
        pezzaturaMax: true,
        // Fase 1 alérgenos: heredado al plato vía computeRecipeAllergens.
        allergen: true,
      },
    },
  },
} as const;

export const recipeListInclude = {
  author: { select: { name: true, email: true } },
  // Banco de Productos — Fase 2: ingredientes estructurados ordenados por
  // position. Para recetas legacy sin filas todavía, viene [].
  recipeIngredients: recipeIngredientsForCostInclude,
} as const;

export const recipeDetailInclude = {
  author: { select: { name: true, email: true } },
  approvedBy: { select: { name: true, email: true } },
  // For the "in which menus is this recipe?" badge on the recipe detail.
  // Los menús en papelera no cuentan como "en el menú" (bug chips fantasma).
  menuItems: {
    where: { menuFolder: { deletedAt: null } },
    include: { menuFolder: { select: { id: true, name: true } } },
  },
  recipeIngredients: recipeIngredientsForCostInclude,
} as const;

export const menuListInclude = {
  _count: { select: { items: true } },
} as const;

export const menuDetailInclude = {
  items: {
    // Caso simétrico: una receta en papelera queda fuera del detalle del menú.
    where: { recipe: { deletedAt: null } },
    orderBy: { order: "asc" },
    include: {
      // Fase 2 alérgenos — para que cada item del menú llegue con
      // `allergens` precomputado (unión heredados + manuales) en la
      // projection. Reusa el include de costo que ya extendió product.allergen
      // en Fase 1, + manualAllergens del Recipe.
      recipe: {
        select: {
          title: true,
          manualAllergens: true,
          recipeIngredients: recipeIngredientsForCostInclude,
        },
      },
    },
  },
  sections: {
    orderBy: { order: "asc" },
    select: { id: true, name: true, order: true },
  },
  clientOverride: { select: { overrides: true } },
  // "Tu estilo" — el detalle expone hasCustomStyle + el spec completo
  // (validado con safeParse en la projection) para que el móvil pueda
  // dibujar la preview sin otro round-trip.
  restaurant: { select: { menuStyleSpec: true } },
} as const;

export const ideaInclude = {
  author: { select: { name: true, email: true } },
  // Idea ↔ Conversation is a 1:1 optional relation, so Prisma does not
  // generate `_count` for it. Fetch the relation id and derive the count
  // in projectIdea (0 or 1).
  conversation: { select: { id: true } },
} as const;

export const restaurantInclude = {
  users: {
    select: { id: true, name: true, email: true, photoUrl: true, role: true },
    orderBy: { createdAt: "asc" },
  },
} as const;

// ─────────── Projections (DB → API) ───────────

type MeUser = {
  id: string;
  email: string | null;
  name: string | null;
  photoUrl: string | null;
  bio: string | null;
  role: string | null;
  languagePref: string | null;
  defaultModel: string | null;
  restaurantId: string | null;
  restaurant: { name: string } | null;
  customProvider: string | null;
  customModel: string | null;
  customApiKey: string | null;
};

export function projectMe(user: MeUser): MeResponse {
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.name ?? user.email ?? "",
    photoUrl: user.photoUrl,
    bio: user.bio,
    role: (user.role ?? "viewer") as MeResponse["role"],
    languagePref: (user.languagePref ?? "es") as MeResponse["languagePref"],
    defaultModel: (user.defaultModel ?? "sonnet") as MeResponse["defaultModel"],
    restaurantId: user.restaurantId,
    restaurantName: user.restaurant?.name ?? null,
    customProvider: user.customProvider as MeResponse["customProvider"] ?? null,
    customModel: user.customModel,
    // Never return the raw key; just whether one is configured.
    customApiKeySet: !!(user.customApiKey && user.customApiKey.length > 0),
  };
}

type RecipeIngredientRow = {
  id: string;
  position: number;
  rawText: string;
  qty: { toString(): string } | null; // Prisma.Decimal
  unit: string | null;
  pezzatura: string | null;
  mermaOverridePct: { toString(): string } | null;
  // Entrega A.5: override de peso por pieza para esta receta. Null = usar
  // el punto medio de pezzaturaMin/Max del producto enlazado.
  pesoCalculoG: { toString(): string } | null;
  product:
    | {
        id: string;
        name: string;
        criticality: string;
        estado: string;
        // Sub-paso 6: campos necesarios para computar el costo.
        precioCompra: number;
        mermaPct: { toString(): string }; // Prisma.Decimal
        unidadCompra: string;
        // Entrega A.5: pezzatura del banco.
        pezzaturaMode: string | null;
        pezzaturaMin: { toString(): string } | null;
        pezzaturaMax: { toString(): string } | null;
        // Fase 1 alérgenos.
        allergen: Allergen | null;
      }
    | null;
};

// C-06a: helper compartido lista/detalle. Convierte filas Prisma de
// RecipeIngredient al shape que espera computeRecipeCost (Decimal→number,
// products con casts a unions del shared).
function mapIngredientsForCost(rows: RecipeIngredientRow[]) {
  return rows.map((row) => ({
    qty: row.qty ? Number(row.qty.toString()) : null,
    unit: row.unit,
    mermaOverridePct: row.mermaOverridePct
      ? Number(row.mermaOverridePct.toString())
      : null,
    pesoCalculoG: row.pesoCalculoG
      ? Number(row.pesoCalculoG.toString())
      : null,
    product: row.product
      ? {
          precioCompra: row.product.precioCompra,
          mermaPct: Number(row.product.mermaPct.toString()),
          unidadCompra: row.product.unidadCompra as ProductUnit,
          pezzaturaMode: row.product.pezzaturaMode as PezzaturaMode | null,
          pezzaturaMin: row.product.pezzaturaMin
            ? Number(row.product.pezzaturaMin.toString())
            : null,
          pezzaturaMax: row.product.pezzaturaMax
            ? Number(row.product.pezzaturaMax.toString())
            : null,
        }
      : null,
  }));
}

type RecipeListRow = {
  id: string;
  title: string;
  state: string;
  priority: boolean;
  version: number;
  updatedAt: Date;
  author: { name: string | null; email: string | null } | null;
  // C-06a: lista trae ingredientes + portions + salePrice para computar el
  // perPortionCents sin pedir el detalle.
  recipeIngredients: RecipeIngredientRow[];
  portions: number | null;
  salePrice: number | null; // centavos
  // Fase 1 alérgenos: lista de manuales aditivos. El array completo lo manda
  // Prisma por default al hacer findMany sin select explícito.
  manualAllergens: Allergen[];
};

export function projectRecipeListItem(r: RecipeListRow): RecipeListItem {
  // C-06a: el coste por porción se computa con el mismo helper que el
  // detalle (computeRecipeCost) para que ambos no divergan.
  const cost = computeRecipeCost({
    ingredients: mapIngredientsForCost(r.recipeIngredients ?? []),
    portions: r.portions,
    salePriceCents: r.salePrice,
  });
  // Fase 1 alérgenos: unión heredados + manuales, dedup, en orden EU 1169.
  const allergensResult = computeRecipeAllergens(
    (r.recipeIngredients ?? []).map((ing) => ({
      productId: ing.product?.id ?? null,
      product: ing.product ? { allergen: ing.product.allergen } : null,
    })),
    r.manualAllergens ?? [],
  );
  return {
    id: r.id,
    title: r.title,
    state: r.state as RecipeListItem["state"],
    priority: r.priority,
    version: r.version,
    authorName: r.author?.name ?? r.author?.email ?? "—",
    updatedAt: r.updatedAt.toISOString(),
    perPortionCents: cost.perPortionCents,
    salePrice: r.salePrice,
    portions: r.portions,
    allergens: allergensResult.allergens,
    unlinkedIngredients: allergensResult.unlinkedIngredients,
  };
}

type RecipeDetailRow = RecipeListRow & {
  contentJson: unknown;
  approvedAt: Date | null;
  sourceConversationId: string | null;
  approvedBy: { name: string | null; email: string | null } | null;
  menuItems: Array<{ menuFolder: { id: string; name: string } | null }>;
};

export function projectRecipeDetail(r: RecipeDetailRow): RecipeDetail {
  // A recipe can appear in the same menu twice via different MenuItem rows
  // (e.g. as a starter and a side); show each menu once.
  const seen = new Set<string>();
  const menus: Array<{ id: string; name: string }> = [];
  for (const mi of r.menuItems ?? []) {
    if (!mi.menuFolder) continue;
    if (seen.has(mi.menuFolder.id)) continue;
    seen.add(mi.menuFolder.id);
    menus.push({ id: mi.menuFolder.id, name: mi.menuFolder.name });
  }

  // Sub-paso 6: cost compute. Pasamos los productos completos (con precio/
  // merma/unidad + pezzatura) al helper. La response al cliente solo expone
  // el breakdown agregado + warningsByIdx para aplicar al ingrediente.
  // C-06a: el mapeo Decimal→number vive en mapIngredientsForCost (compartido
  // con la lista) para que ambos paths no divergan.
  const cost = computeRecipeCost({
    ingredients: mapIngredientsForCost(r.recipeIngredients ?? []),
    portions: r.portions,
    salePriceCents: r.salePrice,
  });

  const recipeIngredients = (r.recipeIngredients ?? []).map((row, idx) => ({
    id: row.id,
    position: row.position,
    rawText: row.rawText,
    qty: row.qty ? Number(row.qty.toString()) : null,
    unit: row.unit,
    pezzatura: row.pezzatura,
    mermaOverridePct: row.mermaOverridePct
      ? Number(row.mermaOverridePct.toString())
      : null,
    // Entrega A.5: pesoCalculoG es Decimal en Prisma → convert a number.
    // Null cuando el chef no personalizó el peso por pieza (usa el banco).
    pesoCalculoG: row.pesoCalculoG ? Number(row.pesoCalculoG.toString()) : null,
    // Warning per-ingredient (rango ancho de pezzatura → costo aproximado).
    pezzaturaWarning: cost.warningsByIdx.get(idx) ?? null,
    product: row.product
      ? {
          id: row.product.id,
          name: row.product.name,
          criticality: row.product.criticality as "alta" | "media" | "baja",
          estado: row.product.estado as "activo" | "borrador" | "archivado",
        }
      : null,
  }));

  return {
    ...projectRecipeListItem(r),
    contentJson: r.contentJson as RecipeDetail["contentJson"],
    recipeIngredients,
    approvedByName: r.approvedBy?.name ?? r.approvedBy?.email ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    sourceConversationId: r.sourceConversationId,
    menus,
    portions: r.portions,
    salePrice: r.salePrice,
    // Exponer todo menos warningsByIdx (Map no serializa a JSON limpio; el
    // mapeo ya se aplicó al recipeIngredients arriba).
    cost: {
      totalCents: cost.totalCents,
      perPortionCents: cost.perPortionCents,
      foodCostPct: cost.foodCostPct,
      totalIngredients: cost.totalIngredients,
      computableCount: cost.computableCount,
      missingPriceCount: cost.missingPriceCount,
      unmeasuredCount: cost.unmeasuredCount,
      unlinkedCount: cost.unlinkedCount,
      wideRangeCount: cost.wideRangeCount,
    },
  };
}

type MenuListRow = {
  id: string;
  name: string;
  season: string | null;
  updatedAt: Date;
  inService: boolean;
  _count: { items: number };
};

export function projectMenuListItem(m: MenuListRow): MenuListItem {
  return {
    id: m.id,
    name: m.name,
    season: m.season,
    itemCount: m._count.items,
    updatedAt: m.updatedAt.toISOString(),
    inService: m.inService,
  };
}

type MenuDetailRow = {
  id: string;
  name: string;
  season: string | null;
  presentationStyle: string;
  inService: boolean;
  // Fase 2 alérgenos — toggle del PDF/preview cliente.
  showAllergensInPdf: boolean;
  items: Array<{
    id: string;
    recipeId: string;
    sectionId: string | null;
    customName: string | null;
    customDesc: string | null;
    price: number;
    order: number;
    recipe:
      | {
          title: string;
          // Fase 2 alérgenos — los necesitamos por item para computar
          // `allergens` por plato en la projection. recipeIngredients reusa el
          // include de costo (que ya trae product.allergen desde Fase 1).
          manualAllergens: Allergen[];
          recipeIngredients: RecipeIngredientRow[];
        }
      | null;
  }>;
  sections: Array<{
    id: string;
    name: string;
    order: number;
  }>;
  // 1:1 nullable — null si nunca se editó la vista cliente.
  clientOverride: { overrides: unknown } | null;
  // "Tu estilo" — solo necesitamos saber si el spec existe.
  restaurant: { menuStyleSpec: unknown } | null;
};

export function projectMenuDetail(m: MenuDetailRow): MenuDetail {
  // The JSON column is typed as `unknown` here; the Zod schema enforces the
  // real shape at the consumer side (mobile + PDF render). We just narrow to
  // `ClientOverrides | null` for the projection.
  const rawOverrides = m.clientOverride?.overrides;
  const clientOverrides =
    rawOverrides && typeof rawOverrides === "object" && !Array.isArray(rawOverrides)
      ? (rawOverrides as ClientOverrides)
      : null;
  const specParse = MenuStyleSpecSchema.safeParse(m.restaurant?.menuStyleSpec ?? null);
  return {
    id: m.id,
    name: m.name,
    season: m.season,
    presentationStyle: m.presentationStyle as MenuDetail["presentationStyle"],
    inService: m.inService,
    showAllergensInPdf: m.showAllergensInPdf,
    // "Tu estilo" — spec corrupto en DB ⇒ se comporta como "sin estilo" (el
    // chip vuelve al flujo de captura), coherente con el fallback del PDF.
    hasCustomStyle: specParse.success,
    menuStyleSpec: specParse.success ? specParse.data : null,
    sections: m.sections.map((s) => ({ id: s.id, name: s.name, order: s.order })),
    items: m.items.map((it) => {
      // Fase 2 alérgenos — unión heredados (de los productos enlazados a
      // los ingredientes de la receta) + manualAllergens, dedup, en orden
      // Reg. EU 1169. Si la receta no llegó (caso defensivo), allergens=[].
      const allergensResult = it.recipe
        ? computeRecipeAllergens(
            (it.recipe.recipeIngredients ?? []).map((ing) => ({
              productId: ing.product?.id ?? null,
              product: ing.product ? { allergen: ing.product.allergen } : null,
            })),
            it.recipe.manualAllergens ?? [],
          )
        : { allergens: [] as Allergen[], unlinkedIngredients: 0 };
      return {
        id: it.id,
        recipeId: it.recipeId,
        sectionId: it.sectionId,
        name: it.customName ?? it.recipe?.title ?? "",
        description: it.customDesc ?? "",
        price: it.price,
        order: it.order,
        // Exponer el flag permite que el compositor staff sepa cuándo el
        // nombre está pisado y muestre el toggle para revertir.
        customName: it.customName,
        allergens: allergensResult.allergens,
        manualAllergens: it.recipe?.manualAllergens ?? [],
      };
    }),
    clientOverrides,
  };
}

type IdeaRow = {
  id: string;
  text: string;
  status: string;
  createdAt: Date;
  author: { name: string | null; email: string | null } | null;
  conversation?: { id: string } | null;
};

export function projectIdea(i: IdeaRow): IdeaResponse {
  return {
    id: i.id,
    text: i.text,
    status: i.status as IdeaResponse["status"],
    createdAt: i.createdAt.toISOString(),
    authorName: i.author?.name ?? i.author?.email ?? "—",
    conversationsCount: i.conversation ? 1 : 0,
  };
}

type RestaurantRow = {
  id: string;
  name: string;
  identityLine: string | null;
  photoUrl: string | null;
  inviteCode: string;
  users: Array<{
    id: string;
    name: string | null;
    email: string | null;
    photoUrl: string | null;
    role: string | null;
  }>;
};

export function projectRestaurant(r: RestaurantRow): RestaurantResponse {
  return {
    id: r.id,
    name: r.name,
    identityLine: r.identityLine,
    photoUrl: r.photoUrl,
    inviteCode: r.inviteCode,
    staff: r.users.map((u) => ({
      id: u.id,
      name: u.name ?? u.email ?? "",
      photoUrl: u.photoUrl,
      role: (u.role ?? "viewer") as RestaurantResponse["staff"][number]["role"],
    })),
  };
}
