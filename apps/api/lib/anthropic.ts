import { readFileSync } from "fs";
import { join } from "path";

const SYSTEM_PROMPT_PATH = join(process.cwd(), "lib", "anthropic-system.md");

let cachedSystemPrompt: string | null = null;
function loadSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  cachedSystemPrompt = readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  return cachedSystemPrompt;
}

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
  culinaryMemory?: string | null,
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

  const blocks: Array<
    | { type: "text"; text: string; cache_control: { type: "ephemeral" } }
    | { type: "text"; text: string }
  > = [staticBlock, identityBlock];

  // A useful memory is stable across turns and gets the third system
  // breakpoint. Changing or deleting it changes this prefix immediately.
  if (culinaryMemory) {
    blocks.push({ type: "text", text: culinaryMemory, cache_control: { type: "ephemeral" } });
  }

  // Recent titles are a cheap fallback only when no useful memory exists.
  // The pinned idea remains after the stable memory and is intentionally live.
  const dynamicLines: string[] = [];
  if (!culinaryMemory && recentRecipes.length > 0) {
    dynamicLines.push("# Recetas recientes del cuaderno");
    for (const r of recentRecipes.slice(0, 8)) {
      dynamicLines.push(`- ${r.title} (${r.state})`);
    }
  }
  if (pinnedIdea) {
    dynamicLines.push("\n# Idea anclada");
    dynamicLines.push(pinnedIdea);
  }

  if (dynamicLines.length > 0) {
    blocks.push({ type: "text", text: dynamicLines.join("\n") });
  }
  return blocks;
}

// Caché del hilo. El breakpoint va SOLO en el último mensaje: en el turno
// siguiente todo lo anterior (bloques de sistema + hilo) se lee desde caché a
// ~10% del precio en vez de reprocesarse entero. Un breakpoint por mensaje
// quemaría el tope de 4 por request sin ganar nada — el prefijo es acumulativo.
//
// El proveedor decide si el prefijo cumple el mínimo de caché del modelo.
export function buildMessageBlocks(messages: Msg[]) {
  const last = messages.length - 1;
  return messages.map((m, i) =>
    i === last
      ? {
          role: m.role,
          content: [
            {
              type: "text" as const,
              text: m.content,
              cache_control: { type: "ephemeral" as const },
            },
          ],
        }
      : { role: m.role, content: m.content },
  );
}
