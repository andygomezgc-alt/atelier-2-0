// One chat turn at a time (A12/A13): the reducer holds the phase, the stream text lives in its own store.
import type { ChatMode } from "@atelier/shared";
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { stopMessage, streamMessage, type ChatMessage } from "@/src/api/conversations";
import { selection } from "@/src/lib/haptics";
import { createClientMessageId, historyBefore } from "./chat-helpers";
import { chatTurnReducer, initialChatTurnState, type ChatTurn, type ChatTurnAction, type ChatTurnState } from "./chat-turn-reducer";
import { createStreamText, type StreamText } from "./stream-text-store";

// Waits before each resume retry after a 409 chat_in_progress (A13): 2 s to 30 s, about 90 s in all.
const RESUME_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000, 30_000];

// A turn whose request is on its way: a cut of these while the app is backgrounded can be resumed.
const isRunning = (phase: ChatTurnState["phase"]) => phase === "sending" || phase === "streaming" || phase === "resuming";

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
  const [state, setState] = useState<ChatTurnState>(initialChatTurnState);
  // Mirror of the reducer state for async work (stream callbacks, timers, AppState) that must read the phase now.
  const stateRef = useRef<ChatTurnState>(initialChatTurnState);
  const [stream] = useState<StreamText>(createStreamText);
  const abortRef = useRef<AbortController | null>(null);
  const backgroundedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest-render entry points, for timers and listeners that outlive the render they were created in.
  const latestRef = useRef({ startResume: () => {}, runResume: () => {} });

  function dispatch(action: ChatTurnAction) {
    const next = chatTurnReducer(stateRef.current, action);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }

  function cancelResume() {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      generation.current += 1;
      cancelResume();
      abortRef.current?.abort();
      stream.dispose();
    };
  }, [generation, stream]);

  // The app leaves the foreground while a turn runs: a cut stream is then a resume candidate, not a failure.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      if (next === "active") {
        if (previous !== "active" && stateRef.current.phase === "interrupted") latestRef.current.startResume();
      } else if (previous === "active" && isRunning(stateRef.current.phase)) {
        backgroundedRef.current = true;
      }
    });
    return () => subscription.remove();
  }, []);

  async function runStream(turn: ChatTurn) {
    const gen = generation.current;
    // A resumed answer is a saved one being recovered: it appears at once, without the typewriter.
    const recovering = stateRef.current.phase === "resuming";
    stream.reset();

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    // Only an answer saved on the server (a conversation exists) can be resumed by its clientMessageId.
    let saved = false;

    try {
      const convId = await ensureConversation(gen, turn.clientMessageId);
      if (gen !== generation.current || ac.signal.aborted) return;
      saved = convId !== null;
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
      const finalText = recovering ? stream.reveal(full) : await stream.finish(full);
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
      // An answer that arrived before a Stop took effect was saved: it ends the turn as answered.
      dispatch({ type: "complete" });
    } catch (err) {
      if (gen !== generation.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      if (err instanceof Error && err.name === "StreamStoppedError") {
        dispatch({ type: "stopped" });
        return;
      }
      if (stateRef.current.phase === "resuming" && (err as { code?: unknown }).code === "chat_in_progress") {
        scheduleResumeRetry(err);
        return;
      }
      if (saved && backgroundedRef.current && isRunning(stateRef.current.phase)) {
        dispatch({ type: "interrupt" });
        if (appStateRef.current === "active") latestRef.current.startResume();
        return;
      }
      // Any stream failure other than an abort goes to the banner with the chef's text kept.
      dispatch({ type: "fail", error: err });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      // A stale generation means the chat changed and the reset already cleared this turn.
      if (gen === generation.current) stream.reset();
    }
  }

  function scheduleResumeRetry(error: unknown) {
    const attempt = stateRef.current.phase === "resuming" ? stateRef.current.attempt : 1;
    dispatch({ type: "resumeConflict", error });
    // The reducer gave up after its last attempt: the banner shows the conflict with Retry.
    if (stateRef.current.phase !== "resuming") return;
    cancelResume();
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      latestRef.current.runResume();
    }, RESUME_DELAYS_MS[attempt - 1]);
  }

  function runResume() {
    const current = stateRef.current;
    if (current.phase !== "resuming") return;
    void runStream(current.turn);
  }

  function startResume() {
    if (stateRef.current.phase !== "interrupted") return;
    backgroundedRef.current = false;
    dispatch({ type: "resume" });
    runResume();
  }

  latestRef.current = { startResume, runResume };

  function send(content: string, model: ChatMode) {
    const turn: ChatTurn = { clientMessageId: createClientMessageId(), content, model };
    setMessages((prev) => [
      ...prev,
      { id: `local-${turn.clientMessageId}`, clientMessageId: turn.clientMessageId, role: "user", content, createdAt: new Date().toISOString() },
    ]);
    backgroundedRef.current = false;
    dispatch({ type: "start", turn });
    return runStream(turn);
  }

  // Same clientMessageId: the server resumes the unanswered question.
  function retry() {
    const current = stateRef.current;
    if (current.phase !== "error") return Promise.resolve();
    backgroundedRef.current = false;
    dispatch({ type: "retry" });
    return runStream(current.turn);
  }

  function continueWithDaily() {
    const current = stateRef.current;
    if (current.phase !== "error") return Promise.resolve();
    setModel("daily");
    const turn: ChatTurn = { ...current.turn, model: "daily" };
    backgroundedRef.current = false;
    dispatch({ type: "start", turn });
    return runStream(turn);
  }

  function restoreUnanswered(question: ChatTurn) {
    dispatch({ type: "restoreUnanswered", turn: question });
  }

  // Stop: the local stream is aborted at once; the server is asked to stop the saved generation.
  // The partial text is discarded (the server saves nothing on stop); the question stays unanswered.
  async function stop(conversationId: string | null) {
    const current = stateRef.current;
    if (current.phase !== "sending" && current.phase !== "streaming" && current.phase !== "resuming" && current.phase !== "interrupted") return;
    const stoppedTurn = current.turn.clientMessageId;
    cancelResume();
    dispatch({ type: "stop" });
    abortRef.current?.abort();
    if (conversationId) {
      try {
        await stopMessage(conversationId);
      } catch {
        // The turn ends on this device either way; no raw error reaches the chef.
      }
    }
    // The request can outlive its turn: the answer may complete meanwhile and a newer turn may start.
    // Only the stopped turn is ended here; a newer turn keeps its phase and its streamed text.
    const latest = stateRef.current;
    if (latest.phase !== "stopping" || latest.turn.clientMessageId !== stoppedTurn) return;
    dispatch({ type: "stopped" });
    stream.reset();
  }

  function reset() {
    cancelResume();
    abortRef.current?.abort();
    abortRef.current = null;
    backgroundedRef.current = false;
    stream.reset();
    dispatch({ type: "reset" });
  }

  const phase = state.phase;
  return {
    phase,
    // Every phase in which the chat cannot be switched or sent to: a turn is running, stopping or waiting to resume.
    busy: phase === "sending" || phase === "streaming" || phase === "stopping" || phase === "interrupted" || phase === "resuming",
    // The failed turn while the banner shows; null otherwise.
    failed: state.phase === "error" ? { turn: state.turn, failure: state.failure } : null,
    stream,
    inFlight: () => abortRef.current !== null,
    send,
    retry,
    continueWithDaily,
    restoreUnanswered,
    reset,
    stop,
  };
}
