import { describe, expect, it } from "vitest";
import { MESSAGE_CONTENT_MAX } from "@atelier/shared";
import { buildHistoryUpload } from "../chat-history-upload";

const none = new Set<string>();
const user = (id: string, content: string, clientMessageId?: string | null) => ({ id, role: "user" as const, content, clientMessageId });
const assistant = (id: string, content: string, clientMessageId?: string | null) => ({ id, role: "assistant" as const, content, clientMessageId });

describe("buildHistoryUpload (A10c)", () => {
  it("keeps the message's own clientMessageId", () => {
    const [item] = buildHistoryUpload([user("local-c1", "Hola", "c1")], none);
    expect(item).toEqual({ role: "user", content: "Hola", clientMessageId: "c1" });
  });

  it("gives a message without clientMessageId a non-empty id derived from its local id, the same on every call", () => {
    const history = [assistant("assistant-1717", "Respuesta"), user("local-x", "Pregunta", "")];
    const first = buildHistoryUpload(history, none);
    expect(first.map((item) => item.clientMessageId)).toEqual([expect.any(String), expect.any(String)]);
    expect(first[0]!.clientMessageId.length).toBeGreaterThan(0);
    expect(first[1]!.clientMessageId.length).toBeGreaterThan(0);
    expect(buildHistoryUpload(history, none)).toEqual(first);
  });

  it("keeps derived ids within the 64-character limit and distinct for long local ids with a shared prefix", () => {
    const prefix = "p".repeat(80);
    const [a] = buildHistoryUpload([assistant(`${prefix}A`, "x")], none);
    const [b] = buildHistoryUpload([assistant(`${prefix}B`, "x")], none);
    expect(a!.clientMessageId.length).toBeLessThanOrEqual(64);
    expect(b!.clientMessageId.length).toBeLessThanOrEqual(64);
    expect(a!.clientMessageId).not.toBe(b!.clientMessageId);
    expect(buildHistoryUpload([assistant(`${prefix}A`, "x")], none)[0]!.clientMessageId).toBe(a!.clientMessageId);
  });

  it("filters already-stored ids on resume, including derived ids", () => {
    const history = [user("local-c1", "Uno", "c1"), assistant("assistant-2", "Dos"), user("local-c3", "Tres", "c3")];
    const derived = buildHistoryUpload(history, none)[1]!.clientMessageId;
    const resumed = buildHistoryUpload(history, new Set(["c1", derived]));
    expect(resumed.map((item) => item.content)).toEqual(["Tres"]);
  });

  it("never splits an emoji at the content limit, so the upload stays valid text", () => {
    const straddling = "a".repeat(MESSAGE_CONTENT_MAX - 1) + "😀";
    const [clamped] = buildHistoryUpload([user("u1", straddling, "c1")], none);
    expect(clamped!.content.length).toBeLessThanOrEqual(MESSAGE_CONTENT_MAX);
    expect(clamped!.content).toBe("a".repeat(MESSAGE_CONTENT_MAX - 1));
    expect(() => encodeURIComponent(clamped!.content)).not.toThrow();

    const leading = "😀" + "b".repeat(MESSAGE_CONTENT_MAX);
    const [kept] = buildHistoryUpload([user("u2", leading, "c2")], none);
    expect(kept!.content.length).toBeLessThanOrEqual(MESSAGE_CONTENT_MAX);
    expect(() => encodeURIComponent(kept!.content)).not.toThrow();
  });

  it("clamps long content to the limit and leaves shorter content untouched", () => {
    const [long, short] = buildHistoryUpload([user("u1", "a".repeat(MESSAGE_CONTENT_MAX + 5), "c1"), user("u2", "corto", "c2")], none);
    expect(long!.content).toBe("a".repeat(MESSAGE_CONTENT_MAX));
    expect(short!.content).toBe("corto");
  });

  it("skips empty and whitespace-only messages", () => {
    const items = buildHistoryUpload(
      [user("u1", "", "c1"), assistant("a1", "   \n\t "), user("u2", "Válido", "c2"), assistant("a2", "", null)],
      none,
    );
    expect(items.map((item) => item.content)).toEqual(["Válido"]);
  });

  it("skips a message that is only whitespace within the limit, since that is what would be uploaded", () => {
    const items = buildHistoryUpload([user("u1", " ".repeat(MESSAGE_CONTENT_MAX) + "texto tardío", "c1")], none);
    expect(items).toEqual([]);
  });

  it("keeps the order of the history", () => {
    const items = buildHistoryUpload([user("u1", "Uno", "c1"), assistant("a1", "Dos", "c1:assistant"), user("u2", "Tres", "c2")], none);
    expect(items.map((item) => [item.content, item.clientMessageId])).toEqual([
      ["Uno", "c1"],
      ["Dos", "c1:assistant"],
      ["Tres", "c2"],
    ]);
  });
});
