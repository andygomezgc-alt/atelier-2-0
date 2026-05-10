import type {
  MeResponse,
  RecipeListItem,
  RecipeDetail,
  MenuListItem,
  MenuDetail,
  IdeaResponse,
  RestaurantResponse,
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
} as const;

export const recipeListInclude = {
  author: { select: { name: true, email: true } },
} as const;

export const recipeDetailInclude = {
  author: { select: { name: true, email: true } },
  approvedBy: { select: { name: true, email: true } },
} as const;

export const menuListInclude = {
  _count: { select: { items: true } },
} as const;

export const menuDetailInclude = {
  items: {
    orderBy: { order: "asc" },
    include: { recipe: { select: { title: true } } },
  },
} as const;

export const ideaInclude = {
  author: { select: { name: true, email: true } },
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

type RecipeDetailRow = RecipeListRow & {
  contentJson: unknown;
  approvedAt: Date | null;
  sourceConversationId: string | null;
  approvedBy: { name: string | null; email: string | null } | null;
};

export function projectRecipeDetail(r: RecipeDetailRow): RecipeDetail {
  return {
    ...projectRecipeListItem(r),
    contentJson: r.contentJson as RecipeDetail["contentJson"],
    approvedByName: r.approvedBy?.name ?? r.approvedBy?.email ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    sourceConversationId: r.sourceConversationId,
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
    customName: string | null;
    customDesc: string | null;
    price: number;
    order: number;
    recipe: { title: string } | null;
  }>;
};

export function projectMenuDetail(m: MenuDetailRow): MenuDetail {
  return {
    id: m.id,
    name: m.name,
    season: m.season,
    presentationStyle: m.presentationStyle as MenuDetail["presentationStyle"],
    items: m.items.map((it) => ({
      id: it.id,
      recipeId: it.recipeId,
      name: it.customName ?? it.recipe?.title ?? "",
      description: it.customDesc ?? "",
      price: it.price,
      order: it.order,
    })),
  };
}

type IdeaRow = {
  id: string;
  text: string;
  status: string;
  createdAt: Date;
  author: { name: string | null; email: string | null } | null;
};

export function projectIdea(i: IdeaRow): IdeaResponse {
  return {
    id: i.id,
    text: i.text,
    status: i.status as IdeaResponse["status"],
    createdAt: i.createdAt.toISOString(),
    authorName: i.author?.name ?? i.author?.email ?? "—",
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
