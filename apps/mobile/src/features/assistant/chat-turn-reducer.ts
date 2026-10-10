// Chat-turn state machine for the assistant screen (A12). Pure: no React, no I/O.
// Streamed text is NOT part of this state: it lives in stream-text-store, so per-chunk
// updates never re-render the screen. A13 adds stop (stopping, ends unanswered) and
// background interruption with resume (interrupted, resuming). A13 transitions are stubs (step 1).

export type ChatModel = "daily" | "creative";

export type ChatTurn = {
  clientMessageId: string;
  content: string;
  model: ChatModel;
};

// error === null: the chat was opened with its last question unanswered (not a failure).
// Otherwise the raw error; it is classified and translated at render time.
export type ChatTurnFailure = { error: unknown };

export type ChatTurnState =
  | { phase: "idle" }
  | { phase: "sending"; turn: ChatTurn }
  | { phase: "streaming"; turn: ChatTurn }
  | { phase: "stopping"; turn: ChatTurn }
  | { phase: "interrupted"; turn: ChatTurn }
  | { phase: "resuming"; turn: ChatTurn; attempt: number }
  | { phase: "error"; turn: ChatTurn; failure: ChatTurnFailure };

export type ChatTurnAction =
  | { type: "start"; turn: ChatTurn }
  | { type: "firstDelta" }
  | { type: "complete" }
  | { type: "fail"; error: unknown }
  | { type: "retry" }
  | { type: "restoreUnanswered"; turn: ChatTurn }
  | { type: "reset" }
  | { type: "stop" }
  | { type: "stopped" }
  | { type: "interrupt" }
  | { type: "resume" }
  | { type: "resumeConflict"; error: unknown };

export const initialChatTurnState: ChatTurnState = { phase: "idle" };

// Requests made while resuming an interrupted saved answer before the turn gives up: one immediate
// request, then one per backoff delay (see use-chat-turn). A13.
export const RESUME_MAX_ATTEMPTS = 7;

export function chatTurnReducer(state: ChatTurnState, action: ChatTurnAction): ChatTurnState {
  switch (action.type) {
    case "start":
      return state.phase === "idle" || state.phase === "error" ? { phase: "sending", turn: action.turn } : state;
    case "retry":
      return state.phase === "error" ? { phase: "sending", turn: state.turn } : state;
    case "firstDelta":
      return state.phase === "sending" || state.phase === "resuming" ? { phase: "streaming", turn: state.turn } : state;
    case "complete":
      return state.phase === "sending" || state.phase === "streaming" || state.phase === "resuming" || state.phase === "stopping"
        ? initialChatTurnState
        : state;
    case "fail":
      if (state.phase === "stopping") return { phase: "error", turn: state.turn, failure: { error: null } };
      return state.phase === "sending" || state.phase === "streaming" || state.phase === "resuming"
        ? { phase: "error", turn: state.turn, failure: { error: action.error } }
        : state;
    case "restoreUnanswered":
      return state.phase === "idle" ? { phase: "error", turn: action.turn, failure: { error: null } } : state;
    case "reset":
      return state.phase === "idle" ? state : initialChatTurnState;
    case "stop":
      return state.phase === "sending" || state.phase === "streaming" || state.phase === "resuming" || state.phase === "interrupted"
        ? { phase: "stopping", turn: state.turn }
        : state;
    case "stopped":
      return state.phase === "stopping" || state.phase === "sending" || state.phase === "streaming" || state.phase === "resuming"
        ? { phase: "error", turn: state.turn, failure: { error: null } }
        : state;
    case "interrupt":
      return state.phase === "sending" || state.phase === "streaming" || state.phase === "resuming"
        ? { phase: "interrupted", turn: state.turn }
        : state;
    case "resume":
      return state.phase === "interrupted" ? { phase: "resuming", turn: state.turn, attempt: 1 } : state;
    case "resumeConflict":
      if (state.phase !== "resuming") return state;
      return state.attempt < RESUME_MAX_ATTEMPTS
        ? { phase: "resuming", turn: state.turn, attempt: state.attempt + 1 }
        : { phase: "error", turn: state.turn, failure: { error: action.error } };
    default:
      return state;
  }
}
