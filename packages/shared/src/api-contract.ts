import { z } from "zod";

// ─────────── Common ───────────

export const RoleSchema = z.enum(["admin", "chef_executive", "sous_chef", "viewer"]);
export const RecipeStateSchema = z.enum(["draft", "in_test", "approved"]);
export const MenuStyleSchema = z.enum(["elegant", "rustic", "minimal"]);
export const IdeaStatusSchema = z.enum(["open", "in_chat", "archived"]);
export const LanguageSchema = z.enum(["es", "it", "en"]);
export const ModelSchema = z.enum(["haiku", "sonnet", "opus"]);
export const CustomProviderSchema = z.enum(["anthropic", "openai", "google"]);

// Banco de Productos — los enums declarados acá arriba para que las recetas
// (que ahora referencian estructura de producto en RecipeIngredientResponse)
// puedan usarlos sin orden-de-declaración issues.
export const ProductCategorySchema = z.enum([
  "pescado",
  "carne",
  "verdura",
  "fruta",
  "lacteo",
  "panaderia",
  "seco",
  "especia",
  "hierba",
  "vinagre_aceite",
  "otro",
]);
export const ProductUnitSchema = z.enum(["kg", "g", "l", "ml", "unidad", "caja"]);
export const ProductStateSchema = z.enum(["activo", "borrador", "archivado"]);
export const MermaOrigenSchema = z.enum(["sugerida", "confirmada", "medida"]);
export const CriticalitySchema = z.enum(["alta", "media", "baja"]);

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
  customProvider: CustomProviderSchema.nullable(),
  customModel: z.string().max(120).nullable(),
  // Whether a BYOK key is stored — we never return the key itself.
  customApiKeySet: z.boolean(),
});

export const PatchMeRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(1000).optional(),
  languagePref: LanguageSchema.optional(),
  defaultModel: ModelSchema.optional(),
  // BYOK config. Pass empty string to clear a value.
  customProvider: CustomProviderSchema.nullable().optional(),
  customModel: z.string().max(120).nullable().optional(),
  customApiKey: z.string().max(500).nullable().optional(),
});

// ─────────── /api/restaurant ───────────

export const CreateRestaurantRequestSchema = z.object({
  name: z.string().min(1).max(100),
  identityLine: z.string().max(500).optional(),
});

export const JoinRestaurantRequestSchema = z.object({
  code: z.string().min(4).max(20),
});

export const PatchRestaurantRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  identityLine: z.string().max(500).nullable().optional(),
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

export const PatchIdeaRequestSchema = z
  .object({
    text: z.string().min(1).max(2000).optional(),
    status: IdeaStatusSchema.optional(),
  })
  .refine((d) => d.text !== undefined || d.status !== undefined, {
    message: "At least one of text or status is required",
  });

export const IdeaResponseSchema = z.object({
  id: z.string().max(100),
  text: z.string().max(2000),
  status: IdeaStatusSchema,
  createdAt: z.string().max(50),
  authorName: z.string().max(100),
  conversationsCount: z.number().int().nonnegative().default(0),
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

// Cada línea estructurada de ingrediente — Fase 2 del Banco de Productos.
// rawText es OBLIGATORIO siempre (audit trail). qty/unit/pezzatura opcionales
// porque hoy el form solo captura el nombre; Fase 4 los va a llenar desde
// la respuesta estructurada del asistente.
export const RecipeIngredientInputSchema = z.object({
  rawText: z.string().min(1).max(500),
  productId: z.string().nullable().optional(),
  qty: z.number().nonnegative().nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  pezzatura: z.string().max(100).nullable().optional(),
  mermaOverridePct: z.number().min(0).max(100).nullable().optional(),
});

export const CreateRecipeRequestSchema = z.object({
  title: z.string().min(1).max(200),
  contentJson: RecipeContentSchema,
  // Cuando viene presente, el server crea filas en RecipeIngredient con el
  // productId/rawText/etc. de cada entrada. Debe ser 1:1 con
  // contentJson.ingredients (mismo orden, misma longitud). Si está ausente,
  // legacy: solo contentJson.
  recipeIngredients: z.array(RecipeIngredientInputSchema).max(50).optional(),
  sourceConversationId: z.string().nullable().optional(),
});

export const PatchRecipeRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  contentJson: RecipeContentSchema.optional(),
  // Si se manda, reemplaza completamente las filas existentes (delete + insert).
  recipeIngredients: z.array(RecipeIngredientInputSchema).max(50).optional(),
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

// Línea de ingrediente en la response de detalle. Incluye la info del
// producto enlazado (id + nombre + criticidad + estado) cuando hay match;
// si productId es null la fila es legacy/no enlazada y el cliente solo
// muestra el rawText.
export const RecipeIngredientResponseSchema = z.object({
  id: z.string(),
  position: z.number().int().nonnegative(),
  rawText: z.string(),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  pezzatura: z.string().nullable(),
  mermaOverridePct: z.number().nullable(),
  product: z
    .object({
      id: z.string(),
      name: z.string(),
      criticality: CriticalitySchema,
      estado: ProductStateSchema,
    })
    .nullable(),
});

export const RecipeDetailSchema = RecipeListItemSchema.extend({
  contentJson: RecipeContentSchema,
  // Cuando hay filas en la tabla RecipeIngredient (recetas nuevas + recetas
  // legacy migradas en Fase 5), se exponen acá. Para legacy puro queda [].
  // El cliente debe preferir esto sobre contentJson.ingredients cuando esté
  // poblado (mejor info estructurada).
  recipeIngredients: z.array(RecipeIngredientResponseSchema).max(50).default([]),
  approvedByName: z.string().max(100).nullable(),
  approvedAt: z.string().max(50).nullable(),
  sourceConversationId: z.string().max(100).nullable(),
  menus: z
    .array(z.object({ id: z.string().max(100), name: z.string().max(120) }))
    .max(50)
    .default([]),
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
  // sectionId is nullable: items existed before sections were introduced and
  // a deleted section sets its items to null instead of removing them.
  sectionId: z.string().max(100).nullable(),
  name: z.string().max(200),
  description: z.string().max(1000),
  price: z.number().int().nonnegative().max(1_000_000), // céntimos (max 10k €)
  order: z.number().int().nonnegative().max(10000),
  // null cuando el plato muestra el título canónico de la receta. Si está
  // set, el compositor staff muestra un indicador "✕ override interno" para
  // que el chef sepa que el nombre está desacoplado de la receta original.
  customName: z.string().max(200).nullable(),
});

export const MenuSectionSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(120),
  order: z.number().int().nonnegative().max(10000),
});

export const CreateMenuSectionRequestSchema = z.object({
  name: z.string().min(1).max(120),
});

export const PatchMenuSectionRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  order: z.number().int().nonnegative().max(10000).optional(),
});

// ─────────── Client overrides (Mejora 3) ───────────
// Definidos antes de MenuDetailSchema porque éste los referencia.

const ClientItemOverrideSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  price: z.number().int().nonnegative().max(1_000_000).optional(),
});

const ClientSectionOverrideSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

export const ClientOverridesSchema = z.object({
  restaurantName: z.string().min(1).max(100).optional(),
  menuName: z.string().min(1).max(120).optional(),
  subtitle: z.string().max(60).optional(),
  sections: z.record(z.string().max(100), ClientSectionOverrideSchema).optional(),
  items: z.record(z.string().max(100), ClientItemOverrideSchema).optional(),
});

export const PatchClientOverridesRequestSchema = ClientOverridesSchema;

export const MenuDetailSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(120),
  season: z.string().max(60).nullable(),
  presentationStyle: MenuStyleSchema,
  sections: z.array(MenuSectionSchema).max(50).default([]),
  items: z.array(MenuDishSchema).max(500),
  // Null cuando el menú nunca se editó desde "Vista cliente" — el PDF cliente
  // entonces es idéntico al estado staff (fallback completo).
  clientOverrides: ClientOverridesSchema.nullable().default(null),
});

export const AddMenuItemRequestSchema = z.object({
  recipeId: z.string().max(100),
  sectionId: z.string().max(100).nullable().optional(),
  customName: z.string().max(200).optional(),
  customDesc: z.string().max(1000).optional(),
  price: z.number().int().nonnegative().max(1_000_000),
  presentationStyle: MenuStyleSchema.optional(),
});

export const PatchMenuItemRequestSchema = z.object({
  sectionId: z.string().max(100).nullable().optional(),
  customName: z.string().max(200).nullable().optional(),
  customDesc: z.string().max(1000).nullable().optional(),
  price: z.number().int().nonnegative().max(1_000_000).optional(),
  order: z.number().int().nonnegative().max(10000).optional(),
  presentationStyle: MenuStyleSchema.optional(),
});

// Reorder atómico (transacción) — swap del `order` entre dos items para
// evitar el race del Promise.all en cliente.
export const ReorderItemsRequestSchema = z.object({
  itemAId: z.string().max(100),
  itemBId: z.string().max(100),
});

// ClientOverridesSchema y PatchClientOverridesRequestSchema están definidos
// más arriba (antes de MenuDetailSchema, que los referencia).

// ─────────── /api/products (Banco de Productos) ───────────
// Los enums (ProductCategorySchema, etc.) están declarados al principio del
// archivo porque RecipeIngredientResponseSchema los referencia.

// Precios siempre en centavos enteros (mismo patrón que MenuItem.price).
// Mermas como número decimal 0-100 (con .nonnegative + .max(100) en runtime).
const mermaPctSchema = z.number().min(0).max(100);
const precioSchema = z.number().int().min(0);

export const CreateProductRequestSchema = z.object({
  name: z.string().min(1).max(200),
  category: ProductCategorySchema,
  pezzatura: z.string().max(100).nullable().optional(),
  unidadCompra: ProductUnitSchema,
  precioCompra: precioSchema,
  mermaPct: mermaPctSchema.optional(),
  mermaOrigen: MermaOrigenSchema.optional(),
  proveedor: z.string().max(200).nullable().optional(),
  notas: z.string().max(2000).nullable().optional(),
  estado: ProductStateSchema.optional(),
  aliases: z.array(z.string().min(1).max(200)).max(20).optional(),
  // Si no viene, el server la calcula con defaultCriticality(category, name).
  criticality: CriticalitySchema.optional(),
});

export const PatchProductRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: ProductCategorySchema.optional(),
  pezzatura: z.string().max(100).nullable().optional(),
  unidadCompra: ProductUnitSchema.optional(),
  precioCompra: precioSchema.optional(),
  mermaPct: mermaPctSchema.optional(),
  mermaOrigen: MermaOrigenSchema.optional(),
  proveedor: z.string().max(200).nullable().optional(),
  notas: z.string().max(2000).nullable().optional(),
  estado: ProductStateSchema.optional(),
  aliases: z.array(z.string().min(1).max(200)).max(20).optional(),
  criticality: CriticalitySchema.optional(),
  // Si el chef setea criticality manualmente, marcamos true para que el job
  // semanal de recalc no la pise. El server hace el toggle automáticamente.
  criticalityManual: z.boolean().optional(),
});

export const ProductListItemSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  category: ProductCategorySchema,
  pezzatura: z.string().max(100).nullable(),
  unidadCompra: ProductUnitSchema,
  precioCompra: precioSchema,
  realCost: precioSchema, // computed: precioCompra / (1 - mermaPct/100)
  mermaPct: mermaPctSchema,
  mermaOrigen: MermaOrigenSchema,
  criticality: CriticalitySchema,
  estado: ProductStateSchema,
  precioActualizadoAt: z.string(), // ISO
});

export const ProductDetailSchema = ProductListItemSchema.extend({
  proveedor: z.string().max(200).nullable(),
  notas: z.string().max(2000).nullable(),
  aliases: z.array(z.string()),
  criticalityManual: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Yield test (Fase 6): el chef carga peso bruto y peso útil, el server
// computa la merma medida y actualiza el producto.
export const CreateYieldTestRequestSchema = z.object({
  pesoBrutoG: z.number().positive().max(1_000_000),
  pesoUtilG: z.number().nonnegative().max(1_000_000),
  notas: z.string().max(2000).optional(),
});

// Matching de ingredientes contra el banco. POST con array de queries,
// devuelve un MatchResult por cada uno (mismo orden).
export const MatchProductsRequestSchema = z.object({
  queries: z.array(z.string().min(1).max(500)).max(50),
});

export const MatchResultSchema = z.object({
  level: z.enum(["exact", "probable", "none"]),
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  distance: z.number(),
});

export const MatchProductsResponseSchema = z.object({
  results: z.array(MatchResultSchema),
});

// ─────────── Inferred types (use these in handlers) ───────────

export type MeResponse = z.infer<typeof MeResponseSchema>;
export type CreateRestaurantRequest = z.infer<typeof CreateRestaurantRequestSchema>;
export type PatchRestaurantRequest = z.infer<typeof PatchRestaurantRequestSchema>;
export type RestaurantResponse = z.infer<typeof RestaurantResponseSchema>;
export type CreateIdeaRequest = z.infer<typeof CreateIdeaRequestSchema>;
export type PatchIdeaRequest = z.infer<typeof PatchIdeaRequestSchema>;
export type IdeaResponse = z.infer<typeof IdeaResponseSchema>;
export type CreateRecipeRequest = z.infer<typeof CreateRecipeRequestSchema>;
export type PatchRecipeRequest = z.infer<typeof PatchRecipeRequestSchema>;
export type RecipeListItem = z.infer<typeof RecipeListItemSchema>;
export type RecipeDetail = z.infer<typeof RecipeDetailSchema>;
export type CreateMenuRequest = z.infer<typeof CreateMenuRequestSchema>;
export type PatchMenuRequest = z.infer<typeof PatchMenuRequestSchema>;
export type MenuListItem = z.infer<typeof MenuListItemSchema>;
export type MenuDish = z.infer<typeof MenuDishSchema>;
export type MenuSection = z.infer<typeof MenuSectionSchema>;
export type CreateMenuSectionRequest = z.infer<typeof CreateMenuSectionRequestSchema>;
export type PatchMenuSectionRequest = z.infer<typeof PatchMenuSectionRequestSchema>;
export type MenuDetail = z.infer<typeof MenuDetailSchema>;
export type AddMenuItemRequest = z.infer<typeof AddMenuItemRequestSchema>;
export type PatchMenuItemRequest = z.infer<typeof PatchMenuItemRequestSchema>;
export type ReorderItemsRequest = z.infer<typeof ReorderItemsRequestSchema>;
export type ClientOverrides = z.infer<typeof ClientOverridesSchema>;
export type PatchClientOverridesRequest = z.infer<typeof PatchClientOverridesRequestSchema>;
export type PostMessageRequest = z.infer<typeof PostMessageRequestSchema>;
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;
export type PatchProductRequest = z.infer<typeof PatchProductRequestSchema>;
export type MatchProductsRequest = z.infer<typeof MatchProductsRequestSchema>;
export type MatchResult = z.infer<typeof MatchResultSchema>;
export type MatchProductsResponse = z.infer<typeof MatchProductsResponseSchema>;
export type RecipeIngredientInput = z.infer<typeof RecipeIngredientInputSchema>;
export type RecipeIngredientResponse = z.infer<typeof RecipeIngredientResponseSchema>;
export type CreateYieldTestRequest = z.infer<typeof CreateYieldTestRequestSchema>;
