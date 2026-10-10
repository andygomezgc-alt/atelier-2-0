// One chat turn at a time (A12): the reducer holds the phase, the stream text lives in its own store.
import type { ChatMode } from "@atelier/shared";
import { useEffect, useReducer, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { streamMessage, type ChatMessage } from "@/src/api/conversations";
import { selection } from "@/src/lib/haptics";
import { createClientMessageId, historyBefore } from "./chat-helpers";
import { chatTurnReducer, initialChatTurnState, type ChatTurn } from "./chat-turn-reducer";
import { createStreamText, type StreamText } from "./stream-text-store";

type Params = {
  generation: MutableRefObject<number>;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  ensureConversation: (gen: number, pendingClientMessageId?: string) => Promise<string | null>;
  preloadedIds: MutableRefObject<Set<string>>;
  setModel: Dispatch<SetStateAction<ChatMode>>;
};

export function useChatTurn({
  generation,
  messages,
  setMessages,
  ensureConversation,
  preloadedIds,
  setModel,
}: Params) {
  const [state, dispatch] = useReducer(chatTurnReducer, initialChatTurnState);
  const [stream] = useState<StreamText>(createStreamText);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      generation.current += 1;
      abortRef.current?.abort();
      stream.dispose();
    };
  }, [generation, stream]);

  async function runStream(turn: ChatTurn) {
    const gen = generation.current;
    stream.reset();

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const convId = await ensureConversation(gen, turn.clientMessageId);
      if (gen !== generation.current || ac.signal.aborted) return;
      const previewHistory = convId
        ? undefined
        : historyBefore(messages, turn.clientMessageId).map((m) => ({ role: m.role, content: m.content }));
      const full = await streamMessage(
        convId,
        turn.content,
        turn.model,
        (delta) => {
          if (gen !== generation.current || ac.signal.aborted) return;
          if (stream.push(delta)) {
            selection();
            dispatch({ type: "firstDelta" });
          }
        },
        ac.signal,
        previewHistory,
        turn.clientMessageId,
      );
      if (gen !== generation.current) return;
      // The reveal catches up with the full answer before the bubble is swapped for the saved message.
      const finalText = await stream.finish(full);
      if (gen !== generation.current) return;
      // Mark the id as preloaded so the saved bubble does not replay the entry animation the chef already saw.
      const id = `assistant-${Date.now()}`;
      preloadedIds.current.add(id);
      setMessages((prev) => [
        ...prev,
        {
          id,
          role: "assistant",
          content: finalText,
          createdAt: new Date().toISOString(),
          // Stable per turn: a retried upload sends the same id.
          clientMessageId: `${turn.clientMessageId}:assistant`,
        },
      ]);
    } catch (err) {
      if (gen !== generation.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      // Any stream failure other than an abort goes to the banner with the chef's text kept.
      dispatch({ type: "fail", error: err });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      // A stale generation means the chat changed and the reset already cleared this turn.
      if (gen === generation.current) {
        dispatch({ type: "complete" });
        stream.reset();
      }
    }
  }

  function send(content: string, model: ChatMode) {
    const turn: ChatTurn = { clientMessageId: createClientMessageId(), content, model };
    setMessages((prev) => [
      ...prev,
      { id: `local-${turn.clientMessageId}`, clientMessageId: turn.clientMessageId, role: "user", content, createdAt: new Date().toISOString() },
    ]);
    dispatch({ type: "start", turn });
    return runStream(turn);
  }

  // Same clientMessageId: the server resumes the unanswered question.
  function retry() {
    if (state.phase !== "error") return Promise.resolve();
    const turn = state.turn;
    dispatch({ type: "retry" });
    return runStream(turn);
  }

  function continueWithDaily() {
    if (state.phase !== "error") return Promise.resolve();
    setModel("daily");
    const turn: ChatTurn = { ...state.turn, model: "daily" };
    dispatch({ type: "start", turn });
    return runStream(turn);
  }

  function restoreUnanswered(question: ChatTurn) {
    dispatch({ type: "restoreUnanswered", turn: question });
  }

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    stream.reset();
    dispatch({ type: "reset" });
  }

  return {
    phase: state.phase,
    busy: state.phase === "sending" || state.phase === "streaming",
    // The failed turn while the banner shows; null otherwise.
    failed: state.phase === "error" ? { turn: state.turn, failure: state.failure } : null,
    stream,
    inFlight: () => abortRef.current !== null,
    send,
    retry,
    continueWithDaily,
    restoreUnanswered,
    reset,
  };
}
