import { stripRecipePayload } from "./recipe-payload";

type Turn = { role: string; content: string };
// Only move the starting point when both recipe sections are explicitly present.
// Otherwise retain the full conversation; never silently cut an ingredient list.
function completeRecipe(text: string): boolean {
  return /(?:^|\n)\s*[#*\d.\s-]*(?:ingredientes|ingredienti|ingredients)\b/imu.test(text)
    && /(?:^|\n)\s*[#*\d.\s-]*(?:procedimiento|procedimento|preparazione|elaboración|preparación|método|method|preparation|pasos)\b/imu.test(text);
}

const INGREDIENTS_HEADING = /^\s*[#*\d.\s-]*(?:ingredientes|ingredienti|ingredients)\b/iu;
const METHOD_HEADING = /^\s*[#*\d.\s-]*(?:procedimiento|procedimento|preparazione|elaborazione|elaboración|preparación|método|metodo|method|preparation|procedure|instructions|directions|steps|pasos)\b/iu;

// At least one ingredient line carries a quantity ("200 g arroz", "Sale, 8 g", "½ limone").
// Group labels ("Para el caldo:") do not count, even with a number.
function hasQuantities(text: string): boolean {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => INGREDIENTS_HEADING.test(line));
  if (start < 0) return false;
  const section = lines.slice(start + 1);
  const end = section.findIndex(line => METHOD_HEADING.test(line));
  return (end < 0 ? section : section.slice(0, end))
    .some(line => !line.trim().endsWith(":") && /[\d½¼¾]/u.test(line));
}

// "Save as recipe" is offered once the assistant has written a recipe with quantities, not for loose ideas.
export function hasWrittenRecipe(messages: readonly Turn[]): boolean {
  return messages.some(m => {
    if (m.role !== "assistant") return false;
    const text = stripRecipePayload(m.content);
    return completeRecipe(text) && hasQuantities(text);
  });
}

export function recipeConversationText(messages: readonly Turn[], limit = 30_000): string {
  const turns = messages.filter(m => m.role === "user" || m.role === "assistant").map(m => ({ ...m, content: stripRecipePayload(m.content) }));
  let start = 0;
  for (let i = 0; i < turns.length; i++) if (turns[i]!.role === "assistant" && completeRecipe(turns[i]!.content)) start = Math.max(0, i - 1);
  const text = turns.slice(start).map(m => `${m.role === "user" ? "CHEF" : "ASISTENTE"}:\n${m.content}`).join("\n\n");
  if (text.length > limit) throw new Error("recipe_context_too_long");
  return text;
}
