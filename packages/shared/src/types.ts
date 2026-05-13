// Re-export Prisma-derived types so the rest of the app imports from
// @atelier/shared without depending on @atelier/db directly when only
// the type info is needed.

export type {
  Role,
  RecipeState,
  MenuStyle,
  IdeaStatus,
  Restaurant,
  User,
  Idea,
  Conversation,
  Message,
  Recipe,
  MenuFolder,
  MenuItem,
} from "@atelier/db";

// The shape stored inside Recipe.contentJson. Keep it permissive: the
// chef writes free-form text and we don't want the DB to reject a draft.
export type RecipeContent = {
  ingredients: string[];
  method: string[];
  notes: string;
};

// Shape returned by GET /api/me — a thin projection of the User row.
export type Me = {
  id: string;
  email: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  role: import("@atelier/db").Role;
  languagePref: "es" | "it" | "en";
  defaultModel: "haiku" | "sonnet" | "opus";
  restaurantId: string | null;
};

// Shape returned by GET /api/restaurant — restaurant + its staff.
export type RestaurantWithStaff = {
  id: string;
  name: string;
  identityLine: string | null;
  photoUrl: string | null;
  inviteCode: string;
  staff: Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    role: import("@atelier/db").Role;
  }>;
};

// ─────────── Banco de Productos ───────────
//
// Estos unions mirror los enums de Prisma. Las defino acá para que
// `@atelier/shared` no dependa del cliente Prisma regenerado (la regen
// se corre después de aplicar la migración de la Fase 0).

export type ProductCategory =
  | "pescado"
  | "carne"
  | "verdura"
  | "fruta"
  | "lacteo"
  | "panaderia"
  | "seco"
  | "especia"
  | "hierba"
  | "vinagre_aceite"
  | "otro";

export type ProductUnit = "kg" | "g" | "l" | "ml" | "unidad" | "caja";

export type ProductState = "activo" | "borrador" | "archivado";

export type MermaOrigin = "sugerida" | "confirmada" | "medida";

export type Criticality = "alta" | "media" | "baja";

// Fila en la lista del banco. realCost es calculado en el backend
// (precioCompra / (1 - mermaPct/100)) para que el cliente no tenga que
// re-implementar la fórmula.
export type ProductListItem = {
  id: string;
  name: string;
  category: ProductCategory;
  pezzatura: string | null;
  unidadCompra: ProductUnit;
  precioCompra: number; // centavos
  realCost: number;     // centavos, computed
  mermaPct: number;     // 0-100 (con decimales)
  mermaOrigen: MermaOrigin;
  criticality: Criticality;
  estado: ProductState;
  precioActualizadoAt: string; // ISO
};

export type ProductDetail = ProductListItem & {
  proveedor: string | null;
  notas: string | null;
  aliases: string[];
  criticalityManual: boolean;
  createdAt: string;
  updatedAt: string;
};
