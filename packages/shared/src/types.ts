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
  defaultModel: "sonnet" | "opus";
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
