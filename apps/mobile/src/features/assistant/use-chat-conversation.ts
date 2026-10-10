// Conversation lifecycle of the assistant screen (A12): load for a route, the messages on screen,
// the first send that creates the conversation and uploads the local history (promoteChat).
import { BULK_MESSAGES_MAX, type ChatMode } from "@atelier/shared";
import type { TranslationKey } from "@atelier/i18n";
import { useEffect, useRef, useState } from "react";
import {
  bulkAddMessages,
  createConversation,
  getConversationByIdea,
  listMessages,
  type ChatMessage,
} from "@/src/api/conversations";
import { showToast } from "@/src/components/Toast";
import { apiErrorMessage } from "@/src/lib/api-error";
import { ChatHistoryUploadError } from "@/src/lib/chat-error";
import { buildHistoryUpload } from "@/src/lib/chat-history-upload";
import { historyBefore } from "./chat-helpers";
import type { ChatTurn } from "./chat-turn-reducer";

type TFn = (key: TranslationKey) => string;

type Params = {
  ideaId?: string;
  conversationIdParam?: string;
  chatSession?: string;
  hasRestaurant: boolean;
  userModel: ChatMode;
  t: TFn;
  // Route change: the turn and the composer start over.
  onSwitch: () => void;
  // The chat was opened with its last question unanswered.
  onUnansweredQuestion: (question: ChatTurn) => void;
};

type Promotion = { conversationId: string; uploaded: boolean; storedIds: Set<string> };

export function useChatConversation({
  ideaId,
  conversationIdParam,
  chatSession,
  hasRestaurant,
  userModel,
  t,
  onSwitch,
  onUnansweredQuestion,
}: Params) {
  const [model, setModel] = useState<ChatMode>(userModel);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(conversationIdParam || ideaId));
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Bumped on every route change: async work started before it must not write into the new chat.
  const generation = useRef(0);
  const switchingRef = useRef(false);
  // The conversation created for this chat, until its history is uploaded. storedIds: messages already on the server.
  const promotionRef = useRef<Promotion | null>(null);
  // Messages present at load are not animated; only the ones that arrive live are.
  const preloadedIds = useRef<Set<string>>(new Set());

  // Initialize the model preference once.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setModel(userModel);
  }, [userModel]);

  // Reset chat state and load the right conversation when params change.
  useEffect(() => {
    generation.current += 1;
    setConversationId(null);
    promotionRef.current = null;
    setMessages([]);
    setLoading(Boolean(conversationIdParam || ideaId));
    setLoadError(false);
    switchingRef.current = false;
    onSwitch();
    preloadedIds.current = new Set();

    let cancelled = false;
    const gen = generation.current;
    const isCurrent = () => !cancelled && gen === generation.current;

    if (conversationIdParam) {
      (async () => {
        try {
          const msgs = await listMessages(conversationIdParam);
          if (!isCurrent()) return;
          setConversationId(conversationIdParam);
          preloadedIds.current = new Set(msgs.map((m) => m.id));
          setMessages(msgs);
          const pending = msgs.at(-1);
          if (pending?.role === "user" && pending.clientMessageId) {
            onUnansweredQuestion({ clientMessageId: pending.clientMessageId, content: pending.content, model: userModel });
          }
        } catch (err) {
          if (cancelled) return;
          setLoadError(true);
          showToast(apiErrorMessage(err, t), "error");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (ideaId) {
      (async () => {
        try {
          const conv = await getConversationByIdea(ideaId);
          if (!isCurrent()) return;
          setConversationId(conv.id);
          preloadedIds.current = new Set(conv.messages.map((m) => m.id));
          setMessages(conv.messages);
          const pending = conv.messages.at(-1);
          if (pending?.role === "user" && pending.clientMessageId) {
            onUnansweredQuestion({ clientMessageId: pending.clientMessageId, content: pending.content, model: userModel });
          }
        } catch (err) {
          if (cancelled) return;
          setLoadError(true);
          showToast(apiErrorMessage(err, t), "error");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  // Language/model changes must not reopen or clear the chef's conversation.
  }, [ideaId, conversationIdParam, chatSession, loadAttempt]);

  // The first send that needs the server creates the conversation once and uploads the local history,
  // in order, in chunks of at most BULK_MESSAGES_MAX, before anything else. promotionRef keeps the created
  // id and the ids already stored, so a failed chunk stops the upload and a retry resumes with the rest.
  async function promoteChat(gen: number, pendingClientMessageId?: string): Promise<string> {
    let promotion = promotionRef.current;
    if (!promotion) {
      const conv = await createConversation({ ideaId: ideaId ?? null, modelUsed: model });
      promotion = { conversationId: conv.id, uploaded: false, storedIds: new Set() };
      promotionRef.current = promotion;
    }
    const { conversationId: promotedId, storedIds } = promotion;
    if (!promotion.uploaded) {
      // Ids already stored are left out, so a retry resumes with the chunks that did not reach the server.
      const pending = buildHistoryUpload(historyBefore(messages, pendingClientMessageId), storedIds);
      for (let start = 0; start < pending.length; start += BULK_MESSAGES_MAX) {
        const chunk = pending.slice(start, start + BULK_MESSAGES_MAX);
        try {
          await bulkAddMessages(promotedId, chunk);
        } catch (err) {
          throw new ChatHistoryUploadError(err, promotedId);
        }
        for (const item of chunk) storedIds.add(item.clientMessageId);
      }
      promotion.uploaded = true;
    }
    if (gen === generation.current) setConversationId(promotedId);
    return promotedId;
  }

  async function ensureConversation(gen: number, pendingClientMessageId?: string): Promise<string | null> {
    if (conversationId) return conversationId;
    if (!hasRestaurant) return null;
    return promoteChat(gen, pendingClientMessageId);
  }

  // Changing the chat invalidates the async work of the previous one before navigation commits.
  function beginSwitch() {
    switchingRef.current = true;
    generation.current += 1;
  }

  return {
    model,
    setModel,
    conversationId,
    loading,
    loadError,
    retryLoad: () => setLoadAttempt((attempt) => attempt + 1),
    messages,
    setMessages,
    preloadedIds,
    generation,
    switchingRef,
    beginSwitch,
    promoteChat,
    ensureConversation,
  };
}
