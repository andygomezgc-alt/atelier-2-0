// Chat-turn state machine for the assistant screen (A12). Pure: no React, no I/O.
// Streamed text is NOT part of this state: it lives in stream-text-store, so per-chunk
// updates never re-render the screen. A13 adds stopping / stopped phases.

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
  | { phase: "error"; turn: ChatTurn; failure: ChatTurnFailure };

export type ChatTurnAction =
  | { type: "start"; turn: ChatTurn }
  | { type: "firstDelta" }
  | { type: "complete" }
  | { type: "fail"; error: unknown }
  | { type: "retry" }
  | { type: "restoreUnanswered"; turn: ChatTurn }
  | { type: "reset" };

export const initialChatTurnState: ChatTurnState = { phase: "idle" };

export function chatTurnReducer(state: ChatTurnState, action: ChatTurnAction): ChatTurnState {
  switch (action.type) {
    case "start":
      return state.phase === "idle" || state.phase === "error" ? { phase: "sending", turn: action.turn } : state;
    case "retry":
      return state.phase === "error" ? { phase: "sending", turn: state.turn } : state;
    case "firstDelta":
      return state.phase === "sending" ? { phase: "streaming", turn: state.turn } : state;
    case "complete":
      return state.phase === "sending" || state.phase === "streaming" ? initialChatTurnState : state;
    case "fail":
      return state.phase === "sending" || state.phase === "streaming"
        ? { phase: "error", turn: state.turn, failure: { error: action.error } }
        : state;
    case "restoreUnanswered":
      return state.phase === "idle" ? { phase: "error", turn: action.turn, failure: { error: null } } : state;
    case "reset":
      return state.phase === "idle" ? state : initialChatTurnState;
    default:
      return state;
  }
}
