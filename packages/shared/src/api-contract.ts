import { z } from "zod";

// ─────────── Common ───────────

export const RoleSchema = z.enum(["admin", "chef_executive", "sous_chef", "viewer"]);
export const RecipeStateSchema = z.enum(["draft", "in_test", "approved"]);
export const MenuStyleSchema = z.enum(["elegant", "rustic", "minimal"]);
export const IdeaStatusSchema = z.enum(["open", "in_chat", "archived"]);
export const LanguageSchema = z.enum(["es", "it", "en"]);
export const ModelSchema = z.enum(["sonnet", "opus"]);

export const RecipeContentSchema = z.object({
  ingredients: z.array(z.string().max(500)).max(50).default([]),
  method: z.array(z.string().max(500)).max(50).default([]),
  notes: z.string().max(5000).default(""),
});

// ─────────── /api/me ───────────

export const MeResponseSchema = z.object({
  id: z.string().max(100),
  email: z.string().email().max(254),
  name: z.string().max(100),
  photoUrl: z.string().max(2048).nullable(),
  bio: z.string().max(1000).nullable(),
  role: RoleSchema,
  languagePref: LanguageSchema,
  defaultModel: ModelSchema,
  restaurantId: z.string().max(100).nullable(),
  restaurantName: z.string().max(100).nullable(),
});

export const PatchMeRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(1000).optional(),
  languagePref: LanguageSchema.optional(),
  defaultModel: ModelSchema.optional(),
});

// ─────────── /api/restaurant ───────────

export const CreateRestaurantRequestSchema = z.object({
  name: z.string().min(1).max(100),
  identityLine: z.string().max(500).optional(),
});

export const JoinRestaurantRequestSchema = z.object({
  code: z.string().min(4).max(20),
});

export const RestaurantResponseSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(100),
  identityLine: z.string().max(500).nullable(),
  photoUrl: z.string().max(2048).nullable(),
  inviteCode: z.string().max(20),
  staff: z.array(
    z.object({
      id: z.string().max(100),
      name: z.string().max(100),
      photoUrl: z.string().max(2048).nullable(),
      role: RoleSchema,
    }),
  ).max(100),
});

export const PatchStaffMemberRequestSchema = z.object({
  role: RoleSchema,
});

// ─────────── /api/ideas ───────────

export const CreateIdeaRequestSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const IdeaResponseSchema = z.object({
  id: z.string().max(100),
  text: z.string().max(2000),
  status: IdeaStatusSchema,
  createdAt: z.string().max(50),
  authorName: z.string().max(100),
});

// ─────────── /api/conversations ───────────

export const CreateConversationRequestSchema = z.object({
  ideaId: z.string().max(100).nullable().optional(),
  modelUsed: ModelSchema,
});

export const PostMessageRequestSchema = z.object({
  content: z.string().min(1).max(20_000),
  model: ModelSchema.optional(), // overrides conversation default if present
});

// ─────────── /api/recipes ───────────

export const CreateRecipeRequestSchema = z.object({
  title: z.string().min(1).max(200),
  contentJson: RecipeContentSchema,
  sourceConversationId: z.string().nullable().optional(),
});

export const PatchRecipeRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  contentJson: RecipeContentSchema.optional(),
  state: RecipeStateSchema.optional(),
  priority: z.boolean().optional(),
});

export const RecipeListItemSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(200),
  state: RecipeStateSchema,
  priority: z.boolean(),
  version: z.number().int().nonnegative().max(100000),
  authorName: z.string().max(100),
  updatedAt: z.string().max(50),
});

export const RecipeDetailSchema = RecipeListItemSchema.extend({
  contentJson: RecipeContentSchema,
  approvedByName: z.string().max(100).nullable(),
  approvedAt: z.string().max(50).nullable(),
  sourceConversationId: z.string().max(100).nullable(),
});

// ─────────── /api/menus ───────────

export const CreateMenuRequestSchema = z.object({
  name: z.string().min(1).max(120),
  season: z.string().max(60).optional(),
});

export const PatchMenuRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  season: z.string().max(60).optional(),
  presentationStyle: MenuStyleSchema.optional(),
});

export const MenuListItemSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(120),
  season: z.string().max(60).nullable(),
  itemCount: z.number().int().nonnegative().max(10000),
  updatedAt: z.string().max(50),
});

export const MenuDishSchema = z.object({
  id: z.string().max(100),
  recipeId: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(1000),
  price: z.number().int().nonnegative().max(1_000_000), // céntimos (max 10k €)
  order: z.number().int().nonnegative().max(10000),
});

export const MenuDetailSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(120),
  season: z.string().max(60).nullable(),
  presentationStyle: MenuStyleSchema,
  items: z.array(MenuDishSchema).max(500),
});

export const AddMenuItemRequestSchema = z.object({
  recipeId: z.string().max(100),
  customName: z.string().max(200).optional(),
  customDesc: z.string().max(1000).optional(),
  price: z.number().int().nonnegative().max(1_000_000),
  presentationStyle: MenuStyleSchema.optional(),
});

export const PatchMenuItemRequestSchema = z.object({
  customName: z.string().max(200).nullable().optional(),
  customDesc: z.string().max(1000).nullable().optional(),
  price: z.number().int().nonnegative().max(1_000_000).optional(),
  order: z.number().int().nonnegative().max(10000).optional(),
  presentationStyle: MenuStyleSchema.optional(),
});

// ─────────── Inferred types (use these in handlers) ───────────

export type MeResponse = z.infer<typeof MeResponseSchema>;
export type CreateRestaurantRequest = z.infer<typeof CreateRestaurantRequestSchema>;
export type RestaurantResponse = z.infer<typeof RestaurantResponseSchema>;
export type CreateIdeaRequest = z.infer<typeof CreateIdeaRequestSchema>;
export type IdeaResponse = z.infer<typeof IdeaResponseSchema>;
export type CreateRecipeRequest = z.infer<typeof CreateRecipeRequestSchema>;
export type PatchRecipeRequest = z.infer<typeof PatchRecipeRequestSchema>;
export type RecipeListItem = z.infer<typeof RecipeListItemSchema>;
export type RecipeDetail = z.infer<typeof RecipeDetailSchema>;
export type CreateMenuRequest = z.infer<typeof CreateMenuRequestSchema>;
export type PatchMenuRequest = z.infer<typeof PatchMenuRequestSchema>;
export type MenuListItem = z.infer<typeof MenuListItemSchema>;
export type MenuDish = z.infer<typeof MenuDishSchema>;
export type MenuDetail = z.infer<typeof MenuDetailSchema>;
export type AddMenuItemRequest = z.infer<typeof AddMenuItemRequestSchema>;
export type PatchMenuItemRequest = z.infer<typeof PatchMenuItemRequestSchema>;
export type PostMessageRequest = z.infer<typeof PostMessageRequestSchema>;
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
