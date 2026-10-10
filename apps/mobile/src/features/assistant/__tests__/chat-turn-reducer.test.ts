// A12 RED: the chat-turn reducer owns the turn lifecycle (idle / sending / streaming / error).
import { describe, expect, it } from "vitest";
import {
  chatTurnReducer,
  initialChatTurnState,
  type ChatTurn,
  type ChatTurnState,
} from "../chat-turn-reducer";

const turn: ChatTurn = { clientMessageId: "cm-1", content: "Un plato de berenjena", model: "creative" };
const nextTurn: ChatTurn = { clientMessageId: "cm-2", content: "Otra receta", model: "daily" };
const failure = Object.assign(new Error("stream_error"), { code: "ai_rate_limited" });

describe("chat-turn reducer (A12)", () => {
  it("starts idle", () => {
    expect(initialChatTurnState).toEqual({ phase: "idle" });
  });

  it("moves from idle to sending with the turn", () => {
    expect(chatTurnReducer({ phase: "idle" }, { type: "start", turn })).toEqual({ phase: "sending", turn });
  });

  it("moves from sending to streaming on the first delta and keeps the turn", () => {
    const sending: ChatTurnState = { phase: "sending", turn };
    expect(chatTurnReducer(sending, { type: "firstDelta" })).toEqual({ phase: "streaming", turn });
  });

  it("returns to idle when the streamed answer completes", () => {
    const streaming: ChatTurnState = { phase: "streaming", turn };
    expect(chatTurnReducer(streaming, { type: "complete" })).toEqual({ phase: "idle" });
  });

  it.each<ChatTurnState>([
    { phase: "sending", turn },
    { phase: "streaming", turn },
  ])("keeps the turn and the raw error when $phase fails", (state) => {
    expect(chatTurnReducer(state, { type: "fail", error: failure })).toEqual({
      phase: "error",
      turn,
      failure: { error: failure },
    });
  });

  it("retries the failed turn with the same clientMessageId", () => {
    const errored: ChatTurnState = { phase: "error", turn, failure: { error: failure } };
    expect(chatTurnReducer(errored, { type: "retry" })).toEqual({ phase: "sending", turn });
  });

  it("replaces a failed turn when the chef sends something new", () => {
    const errored: ChatTurnState = { phase: "error", turn, failure: { error: failure } };
    expect(chatTurnReducer(errored, { type: "start", turn: nextTurn })).toEqual({ phase: "sending", turn: nextTurn });
  });

  it.each<ChatTurnState>([
    { phase: "sending", turn },
    { phase: "streaming", turn },
  ])("ignores a second start while $phase is busy", (state) => {
    expect(chatTurnReducer(state, { type: "start", turn: nextTurn })).toEqual(state);
  });

  it.each([{ type: "firstDelta" as const }, { type: "complete" as const }, { type: "fail" as const, error: failure }])(
    "ignores the stale event $type while idle",
    (action) => {
      expect(chatTurnReducer({ phase: "idle" }, action)).toEqual({ phase: "idle" });
    },
  );

  it("reopens an unanswered last question as an error without a failure reason", () => {
    expect(chatTurnReducer({ phase: "idle" }, { type: "restoreUnanswered", turn })).toEqual({
      phase: "error",
      turn,
      failure: { error: null },
    });
  });

  it.each<ChatTurnState>([
    { phase: "idle" },
    { phase: "sending", turn },
    { phase: "streaming", turn },
    { phase: "error", turn, failure: { error: failure } },
  ])("resets to idle from $phase when the chat changes", (state) => {
    expect(chatTurnReducer(state, { type: "reset" })).toEqual({ phase: "idle" });
  });
});
