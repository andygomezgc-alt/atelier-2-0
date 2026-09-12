import { stripRecipePayload } from "./recipe-payload";

type Turn = { role: string; content: string };
// Only move the starting point when both recipe sections are explicitly present.
// Otherwise retain the full conversation; never silently cut an ingredient list.
function completeRecipe(text: string): boolean {
  return /(?:^|\n)\s*[#*\d.\s-]*(?:ingredientes|ingredienti|ingredients)\b/imu.test(text)
    && /(?:^|\n)\s*[#*\d.\s-]*(?:procedimiento|procedimento|preparazione|elaboración|preparación|método|method|preparation|pasos)\b/imu.test(text);
}

export function recipeConversationText(messages: readonly Turn[], limit = 30_000): string {
  const turns = messages.filter(m => m.role === "user" || m.role === "assistant").map(m => ({ ...m, content: stripRecipePayload(m.content) }));
  let start = 0;
  for (let i = 0; i < turns.length; i++) if (turns[i]!.role === "assistant" && completeRecipe(turns[i]!.content)) start = Math.max(0, i - 1);
  const text = turns.slice(start).map(m => `${m.role === "user" ? "CHEF" : "ASISTENTE"}:\n${m.content}`).join("\n\n");
  if (text.length > limit) throw new Error("recipe_context_too_long");
  return text;
}
