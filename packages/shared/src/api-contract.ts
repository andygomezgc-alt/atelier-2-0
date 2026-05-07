import { z } from "zod";

// ─────────── Common ───────────

export const RoleSchema = z.enum(["admin", "chef_executive", "sous_chef", "viewer"]);
export const RecipeStateSchema = z.enum(["draft", "in_test", "approved"]);
export const MenuStyleSchema = z.enum(["elegant", "rustic", "minimal"]);
export const IdeaStatusSchema = z.enum(["open", "in_chat", "archived"]);
export const LanguageSchema = z.enum(["es", "it", "en"]);
export const ModelSchema = z.enum(["sonnet", "opus"]);

export const RecipeContentSchema = z.object({
  ingredients: z.array(z.string()).default([]),
  method: z.array(z.string()).default([]),
  notes: z.string().default(""),
});

// ─────────── /api/me ───────────

export const MeResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  photoUrl: z.string().nullable(),
  bio: z.string().nullable(),
  role: RoleSchema,
  languagePref: LanguageSchema,
  defaultModel: ModelSchema,
  restaurantId: z.string().nullable(),
});

export const PatchMeRequestSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bio: z.string().max(140).optional(),
  languagePref: LanguageSchema.optional(),
  defaultModel: ModelSchema.optional(),
});

// ─────────── /api/restaurant ───────────

export const CreateRestaurantRequestSchema = z.object({
  name: z.string().min(1).max(80),
  identityLine: z.string().max(140).optional(),
});

export const JoinRestaurantRequestSchema = z.object({
  code: z.string().min(4).max(20),
});

export const RestaurantResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  identityLine: z.string().nullable(),
  photoUrl: z.string().nullable(),
  inviteCode: z.string(),
  staff: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      photoUrl: z.string().nullable(),
      role: RoleSchema,
    }),
  ),
});

export const PatchStaffMemberRequestSchema = z.object({
  role: RoleSchema,
});

// ─────────── /api/ideas ───────────

export const CreateIdeaRequestSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const IdeaResponseSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: IdeaStatusSchema,
  createdAt: z.string(),
  authorName: z.string(),
});

// ─────────── /api/conversations ───────────

export const CreateConversationRequestSchema = z.object({
  ideaId: z.string().nullable().optional(),
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
  id: z.string(),
  title: z.string(),
  state: RecipeStateSchema,
  priority: z.boolean(),
  version: z.number().int(),
  authorName: z.string(),
  updatedAt: z.string(),
});

export const RecipeDetailSchema = RecipeListItemSchema.extend({
  contentJson: RecipeContentSchema,
  approvedByName: z.string().nullable(),
  approvedAt: z.string().nullable(),
  sourceConversationId: z.string().nullable(),
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
  id: z.string(),
  name: z.string(),
  season: z.string().nullable(),
  itemCount: z.number().int(),
  updatedAt: z.string(),
});

export const MenuDishSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number().int().nonnegative(), // céntimos
  order: z.number().int().nonnegative(),
});

export const MenuDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  season: z.string().nullable(),
  presentationStyle: MenuStyleSchema,
  items: z.array(MenuDishSchema),
});

export const AddMenuItemRequestSchema = z.object({
  recipeId: z.string(),
  customName: z.string().max(200).optional(),
  customDesc: z.string().max(400).optional(),
  price: z.number().int().nonnegative(),
  presentationStyle: MenuStyleSchema.optional(),
});

export const PatchMenuItemRequestSchema = z.object({
  customName: z.string().max(200).nullable().optional(),
  customDesc: z.string().max(400).nullable().optional(),
  price: z.number().int().nonnegative().optional(),
  order: z.number().int().nonnegative().optional(),
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
export type MenuListItem = z.infer<typeof MenuListItemSchema>;
export type MenuDish = z.infer<typeof MenuDishSchema>;
export type MenuDetail = z.infer<typeof MenuDetailSchema>;
export type AddMenuItemRequest = z.infer<typeof AddMenuItemRequestSchema>;
export type PatchMenuItemRequest = z.infer<typeof PatchMenuItemRequestSchema>;
export type PostMessageRequest = z.infer<typeof PostMessageRequestSchema>;
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
