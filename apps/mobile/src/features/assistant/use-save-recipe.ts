// "Guardar como receta" from the assistant (A12): saves the chat as a conversation, then extracts the recipe.
import type { TranslationKey } from "@atelier/i18n";
import { useState, type MutableRefObject } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { extractRecipeFromAssistant } from "@/src/api/recipes";
import { NetworkError as TransportNetworkError } from "@/src/api/client";
import type { ChatMessage } from "@/src/api/conversations";
import { ensureRestaurant } from "@/src/components/LazyRestaurantHost";
import { showToast } from "@/src/components/Toast";
import { apiErrorKey } from "@/src/lib/api-error";
import { ChatHistoryUploadError } from "@/src/lib/chat-error";
import { recipeConversationText } from "@/src/lib/recipe-conversation";
import { setRecipeDraft } from "@/src/lib/recipe-draft";

type TFn = (key: TranslationKey) => string;

type Params = {
  messages: ChatMessage[];
  conversationId: string | null;
  generation: MutableRefObject<number>;
  promoteChat: (gen: number, pendingClientMessageId?: string) => Promise<string>;
  // True while a turn is in flight, failed, or the chat is switching. Read at click time.
  isBlocked: () => boolean;
  t: TFn;
};

// A failed save names its cause with a translated key, never the raw error text.
function saveFailureKey(err: unknown): TranslationKey {
  if (err instanceof TransportNetworkError) return "error_network";
  const code = (err as { code?: unknown } | null)?.code;
  return (typeof code === "string" && apiErrorKey(code)) || "recipe_save_failed";
}

export function useSaveRecipe({ messages, conversationId, generation, promoteChat, isBlocked, t }: Params) {
  const router = useRouter();
  const [structuring, setStructuring] = useState(false);

  // Without a restaurant, saving creates the conversation and uploads the history (promoteChat) first.
  // A failed upload still saves the recipe; the next send retries the upload before streaming.
  async function ensureConversationForSave(): Promise<string | null> {
    if (conversationId) return conversationId;
    try {
      await ensureRestaurant();
    } catch {
      return null;
    }
    try {
      return await promoteChat(generation.current);
    } catch (err) {
      if (err instanceof ChatHistoryUploadError) return err.conversationId;
      throw err;
    }
  }

  async function saveAsRecipe() {
    if (messages.length === 0 || structuring || isBlocked()) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    setStructuring(true);
    try {
      let convId: string | null;
      try {
        convId = await ensureConversationForSave();
      } catch (err) {
        showToast(t(saveFailureKey(err)), "error");
        return;
      }
      if (!convId) {
        setStructuring(false);
        return;
      }

      // Extract the latest complete recipe together with subsequent revisions.
      // Bound the context without silently cutting ingredients or later changes.
      let recipeText: string;
      try { recipeText = recipeConversationText(messages); }
      catch { showToast(t("recipe_context_too_long"), "error"); return; }
      try {
        const ex = await extractRecipeFromAssistant(recipeText);
        setRecipeDraft({
          title: ex.title,
          portions: ex.portions ?? null,
          contentJson: ex.contentJson,
          recipeIngredients: ex.recipeIngredients,
          pendingMatches: ex.pendingMatches,
          sourceConversationId: convId,
        });
        router.push("/recetas/nueva");
      } catch {
        Alert.alert(t("extract_fail_title"), t("extract_fail_body"), [
          {
            text: t("extract_fail_draft"),
            onPress: () => {
              setRecipeDraft({
                title: t("recipe_untitled"),
                contentJson: {
                  ingredients: [],
                  method: [],
                  notes: recipeText.slice(0, 5000),
                },
                sourceConversationId: convId,
              });
              router.push("/recetas/nueva");
            },
          },
          { text: t("extract_fail_cancel"), style: "cancel" },
        ]);
      }
    } finally {
      setStructuring(false);
    }
  }

  return { structuring, saveAsRecipe };
}
