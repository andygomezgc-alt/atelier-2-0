// A12 RED: the chat-turn reducer owns the turn lifecycle (idle / sending / streaming / error).
import { describe, expect, it } from "vitest";
import {
  chatTurnReducer,
  initialChatTurnState,
  type ChatTurn,
  RESUME_MAX_ATTEMPTS,
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

// A13 — stop, the stopped outcome, background interruption and resume (RED: transitions not implemented yet).
describe("chat-turn reducer: stop and resume (A13)", () => {
  const conflict = Object.assign(new Error("chat_in_progress"), { code: "chat_in_progress", status: 409 });
  const unanswered = { phase: "error", turn, failure: { error: null } } as const;

  it.each<ChatTurnState>([
    { phase: "sending", turn },
    { phase: "streaming", turn },
    { phase: "interrupted", turn },
    { phase: "resuming", turn, attempt: 2 },
  ])("stop moves $phase to stopping and keeps the turn", (state) => {
    expect(chatTurnReducer(state, { type: "stop" })).toEqual({ phase: "stopping", turn });
  });

  it.each<ChatTurnState>([{ phase: "idle" }, { phase: "error", turn, failure: { error: conflict } }, { phase: "stopping", turn }])(
    "ignores stop while $phase",
    (state) => {
      expect(chatTurnReducer(state, { type: "stop" })).toEqual(state);
    },
  );

  it("ends a stop with the question unanswered, without a failure", () => {
    expect(chatTurnReducer({ phase: "stopping", turn }, { type: "stopped" })).toEqual(unanswered);
  });

  it.each<ChatTurnState>([
    { phase: "sending", turn },
    { phase: "streaming", turn },
  ])("a stopped event from the server ends $phase the same way", (state) => {
    expect(chatTurnReducer(state, { type: "stopped" })).toEqual(unanswered);
  });

  it("keeps the answer when the stream completes while stopping", () => {
    expect(chatTurnReducer({ phase: "stopping", turn }, { type: "complete" })).toEqual({ phase: "idle" });
  });

  it("a failure while stopping ends unanswered: the stop wins, no failure banner", () => {
    expect(chatTurnReducer({ phase: "stopping", turn }, { type: "fail", error: conflict })).toEqual(unanswered);
  });

  it.each<ChatTurnState>([
    { phase: "sending", turn },
    { phase: "streaming", turn },
    { phase: "resuming", turn, attempt: 1 },
  ])("interrupt moves $phase to interrupted, keeping the turn", (state) => {
    expect(chatTurnReducer(state, { type: "interrupt" })).toEqual({ phase: "interrupted", turn });
  });

  it.each<ChatTurnState>([{ phase: "idle" }, { phase: "error", turn, failure: { error: conflict } }, { phase: "stopping", turn }])(
    "ignores interrupt while $phase",
    (state) => {
      expect(chatTurnReducer(state, { type: "interrupt" })).toEqual(state);
    },
  );

  it("resume restarts an interrupted turn as attempt 1 with the same turn", () => {
    expect(chatTurnReducer({ phase: "interrupted", turn }, { type: "resume" })).toEqual({
      phase: "resuming",
      turn,
      attempt: 1,
    });
  });

  it.each<ChatTurnState>([
    { phase: "idle" },
    { phase: "sending", turn },
    { phase: "error", turn, failure: { error: conflict } },
  ])("ignores resume while $phase", (state) => {
    expect(chatTurnReducer(state, { type: "resume" })).toEqual(state);
  });

  it("the first replayed delta moves a resuming turn to streaming", () => {
    expect(chatTurnReducer({ phase: "resuming", turn, attempt: 1 }, { type: "firstDelta" })).toEqual({
      phase: "streaming",
      turn,
    });
  });

  it("a replayed answer completes a resuming turn", () => {
    expect(chatTurnReducer({ phase: "resuming", turn, attempt: 1 }, { type: "complete" })).toEqual({ phase: "idle" });
  });

  it("a 409 while resuming asks again with the next attempt", () => {
    expect(
      chatTurnReducer({ phase: "resuming", turn, attempt: 1 }, { type: "resumeConflict", error: conflict }),
    ).toEqual({ phase: "resuming", turn, attempt: 2 });
  });

  it("gives up after RESUME_MAX_ATTEMPTS conflicts, with the last conflict as the failure", () => {
    expect(
      chatTurnReducer(
        { phase: "resuming", turn, attempt: RESUME_MAX_ATTEMPTS },
        { type: "resumeConflict", error: conflict },
      ),
    ).toEqual({ phase: "error", turn, failure: { error: conflict } });
  });

  it("a failure while resuming shows the honest failure", () => {
    expect(
      chatTurnReducer({ phase: "resuming", turn, attempt: 2 }, { type: "fail", error: conflict }),
    ).toEqual({ phase: "error", turn, failure: { error: conflict } });
  });

  it.each<ChatTurnState>([
    { phase: "stopping", turn },
    { phase: "interrupted", turn },
    { phase: "resuming", turn, attempt: 3 },
  ])("reset returns $phase to idle", (state) => {
    expect(chatTurnReducer(state, { type: "reset" })).toEqual({ phase: "idle" });
  });
});
