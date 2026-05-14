import type {
  MeResponse,
  RecipeListItem,
  RecipeDetail,
  MenuListItem,
  MenuDetail,
  IdeaResponse,
  RestaurantResponse,
  ClientOverrides,
} from "@atelier/shared";

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

export const recipeListInclude = {
  author: { select: { name: true, email: true } },
} as const;

export const recipeDetailInclude = {
  author: { select: { name: true, email: true } },
  approvedBy: { select: { name: true, email: true } },
  // For the "in which menus is this recipe?" badge on the recipe detail.
  menuItems: {
    include: { menuFolder: { select: { id: true, name: true } } },
  },
  // Banco de Productos — Fase 2: ingredientes estructurados (productId,
  // qty, unit, pezzatura, mermaOverridePct, rawText). Ordenados por position.
  // Para recetas legacy sin filas todavía, viene []; el cliente cae al
  // contentJson.ingredients de strings.
  recipeIngredients: {
    orderBy: { position: "asc" },
    include: {
      product: { select: { id: true, name: true, criticality: true, estado: true } },
    },
  },
} as const;

export const menuListInclude = {
  _count: { select: { items: true } },
} as const;

export const menuDetailInclude = {
  items: {
    orderBy: { order: "asc" },
    include: { recipe: { select: { title: true } } },
  },
  sections: {
    orderBy: { order: "asc" },
    select: { id: true, name: true, order: true },
  },
  clientOverride: { select: { overrides: true } },
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

type RecipeListRow = {
  id: string;
  title: string;
  state: string;
  priority: boolean;
  version: number;
  updatedAt: Date;
  author: { name: string | null; email: string | null } | null;
};

export function projectRecipeListItem(r: RecipeListRow): RecipeListItem {
  return {
    id: r.id,
    title: r.title,
    state: r.state as RecipeListItem["state"],
    priority: r.priority,
    version: r.version,
    authorName: r.author?.name ?? r.author?.email ?? "—",
    updatedAt: r.updatedAt.toISOString(),
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
  product: { id: string; name: string; criticality: string; estado: string } | null;
};

type RecipeDetailRow = RecipeListRow & {
  contentJson: unknown;
  approvedAt: Date | null;
  sourceConversationId: string | null;
  approvedBy: { name: string | null; email: string | null } | null;
  menuItems: Array<{ menuFolder: { id: string; name: string } | null }>;
  recipeIngredients: RecipeIngredientRow[];
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
  return {
    ...projectRecipeListItem(r),
    contentJson: r.contentJson as RecipeDetail["contentJson"],
    recipeIngredients: (r.recipeIngredients ?? []).map((row) => ({
      id: row.id,
      position: row.position,
      rawText: row.rawText,
      qty: row.qty ? Number(row.qty.toString()) : null,
      unit: row.unit,
      pezzatura: row.pezzatura,
      mermaOverridePct: row.mermaOverridePct ? Number(row.mermaOverridePct.toString()) : null,
      product: row.product
        ? {
            id: row.product.id,
            name: row.product.name,
            criticality: row.product.criticality as "alta" | "media" | "baja",
            estado: row.product.estado as "activo" | "borrador" | "archivado",
          }
        : null,
    })),
    approvedByName: r.approvedBy?.name ?? r.approvedBy?.email ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    sourceConversationId: r.sourceConversationId,
    menus,
  };
}

type MenuListRow = {
  id: string;
  name: string;
  season: string | null;
  updatedAt: Date;
  _count: { items: number };
};

export function projectMenuListItem(m: MenuListRow): MenuListItem {
  return {
    id: m.id,
    name: m.name,
    season: m.season,
    itemCount: m._count.items,
    updatedAt: m.updatedAt.toISOString(),
  };
}

type MenuDetailRow = {
  id: string;
  name: string;
  season: string | null;
  presentationStyle: string;
  items: Array<{
    id: string;
    recipeId: string;
    sectionId: string | null;
    customName: string | null;
    customDesc: string | null;
    price: number;
    order: number;
    recipe: { title: string } | null;
  }>;
  sections: Array<{
    id: string;
    name: string;
    order: number;
  }>;
  // 1:1 nullable — null si nunca se editó la vista cliente.
  clientOverride: { overrides: unknown } | null;
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
  return {
    id: m.id,
    name: m.name,
    season: m.season,
    presentationStyle: m.presentationStyle as MenuDetail["presentationStyle"],
    sections: m.sections.map((s) => ({ id: s.id, name: s.name, order: s.order })),
    items: m.items.map((it) => ({
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
    })),
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
