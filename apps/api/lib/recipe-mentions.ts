import type { ReferencedRecipe } from "./anthropic";

// The house recipes the chef names in a conversation, so the assistant reads
// their sheet instead of guessing ingredients and method from the title.

const MAX_MENTIONED = 3;
const MAX_INGREDIENTS = 30;
const MAX_INGREDIENT_CHARS = 120;
const MAX_STEPS = 15;
const MAX_STEP_CHARS = 300;

// Words that introduce a known dish: "el chilindrón", "mis pochas". Without
// one, a dish word is more often an ingredient for a new dish than a reference.
const DETERMINERS = new Set([
  "el", "la", "los", "las", "lo", "al", "del", "mi", "mis", "tu", "tus", "su", "sus",
  "nuestro", "nuestra", "nuestros", "nuestras", "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas",
  "the", "our", "my", "this", "these",
]);
// Words chefs use in passing ("la temporada", "de la casa"), never to name one dish.
const GENERIC = new Set(["casa", "temporada", "receta", "plato", "estilo", "version"]);

const words = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  .split(/[^a-z0-9]+/).filter(Boolean);
// Singular and plural name the same dish: "la torrija", "las torrijas".
const stem = (word: string) => word.endsWith("s") ? word.slice(0, -1) : word;

/**
 * A recipe is named when a message holds its dish name (the title before the
 * first comma) or, after a determiner, a word of that name no other dish
 * shares. Keeps the three named most recently, in order of first mention, so
 * the list changes only when the chef names another dish.
 */
export function mentionedRecipeIds(menu: { id: string; title: string }[], messages: string[]): string[] {
  const dishes = menu.map(recipe => {
    const name = words(recipe.title.split(",")[0] ?? "");
    return {
      id: recipe.id,
      phrase: name.length > 1 ? ` ${name.join(" ")} ` : null,
      stems: new Set(name.filter(word => word.length >= 4 && !GENERIC.has(word)).map(stem)),
    };
  });
  const dishesWith = new Map<string, number>();
  for (const dish of dishes) for (const word of dish.stems) dishesWith.set(word, (dishesWith.get(word) ?? 0) + 1);

  const first = new Map<string, number>();
  const last = new Map<string, number>();
  messages.forEach((message, index) => {
    const text = words(message);
    const phrase = ` ${text.join(" ")} `;
    const introduced = new Set(text.flatMap((word, i) => i > 0 && DETERMINERS.has(text[i - 1]!) ? [stem(word)] : []));
    for (const dish of dishes) {
      const named = (dish.phrase !== null && phrase.includes(dish.phrase))
        || [...dish.stems].some(word => dishesWith.get(word) === 1 && introduced.has(word));
      if (!named) continue;
      if (!first.has(dish.id)) first.set(dish.id, index);
      last.set(dish.id, index);
    }
  });
  const recent = new Set([...last.keys()].sort((a, b) => last.get(b)! - last.get(a)!).slice(0, MAX_MENTIONED));
  return [...first.keys()].filter(id => recent.has(id));
}

const clip = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};
const strings = (x: unknown) => Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];

/** The sheet the assistant reads: ingredients and method, bounded for very long recipes. */
export function recipeSheet(recipe: { title: string; contentJson: unknown; recipeIngredients: { rawText: string }[] }): ReferencedRecipe {
  const content = (recipe.contentJson ?? {}) as Record<string, unknown>;
  // Same precedence as the culinary memory: saved ingredient lines win over the content draft.
  const ingredients = recipe.recipeIngredients.length ? recipe.recipeIngredients.map(line => line.rawText) : strings(content.ingredients);
  return {
    title: clip(recipe.title, 200),
    ingredients: ingredients.map(line => clip(line, MAX_INGREDIENT_CHARS)).filter(Boolean).slice(0, MAX_INGREDIENTS),
    method: strings(content.method).map(step => clip(step, MAX_STEP_CHARS)).filter(Boolean).slice(0, MAX_STEPS),
  };
}
