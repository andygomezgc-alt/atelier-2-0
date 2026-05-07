import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

const SYSTEM_PROMPT_PATH = join(process.cwd(), "lib", "anthropic-system.md");

let cachedSystemPrompt: string | null = null;
function loadSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  cachedSystemPrompt = readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  return cachedSystemPrompt;
}

export const MODEL_IDS = {
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-5",
} as const;

type ModelKey = keyof typeof MODEL_IDS;

type RestaurantContext = {
  name: string;
  identityLine: string | null;
};

type RecentRecipe = {
  title: string;
  state: string;
};

export type Msg = { role: "user" | "assistant"; content: string };

export function buildSystemBlocks(
  restaurant: RestaurantContext,
  recentRecipes: RecentRecipe[],
  pinnedIdea: string | null,
) {
  const principles = loadSystemPrompt();

  // Static block — long-lived, cached for ~5 min by Anthropic.
  const staticBlock = {
    type: "text" as const,
    text: principles,
    cache_control: { type: "ephemeral" as const },
  };

  // Restaurant identity — also stable per session, cached.
  const identityText = `# Restaurante: ${restaurant.name}\n${
    restaurant.identityLine ? `Identidad: ${restaurant.identityLine}\n` : ""
  }`;
  const identityBlock = {
    type: "text" as const,
    text: identityText,
    cache_control: { type: "ephemeral" as const },
  };

  // Dynamic context — recent recipes + pinned idea. Not cached.
  const dynamicLines: string[] = [];
  if (recentRecipes.length > 0) {
    dynamicLines.push("# Recetas recientes del cuaderno");
    for (const r of recentRecipes.slice(0, 8)) {
      dynamicLines.push(`- ${r.title} (${r.state})`);
    }
  }
  if (pinnedIdea) {
    dynamicLines.push("\n# Idea anclada");
    dynamicLines.push(pinnedIdea);
  }

  const blocks: Array<
    | { type: "text"; text: string; cache_control: { type: "ephemeral" } }
    | { type: "text"; text: string }
  > = [staticBlock, identityBlock];
  if (dynamicLines.length > 0) {
    blocks.push({ type: "text", text: dynamicLines.join("\n") });
  }
  return blocks;
}

export function streamMessage({
  model,
  system,
  messages,
}: {
  model: ModelKey;
  system: ReturnType<typeof buildSystemBlocks>;
  messages: Msg[];
}) {
  return client.messages.stream({
    model: MODEL_IDS[model],
    max_tokens: 2048,
    system,
    messages,
  });
}
