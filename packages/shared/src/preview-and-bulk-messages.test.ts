import { describe, it, expect } from "vitest";
import {
  PostMessageRequestSchema,
  BulkMessagesRequestSchema,
} from "./api-contract";

describe("PostMessageRequestSchema (A-12) — history opcional", () => {
  it("acepta request normal sin history (modo persistente)", () => {
    expect(
      PostMessageRequestSchema.safeParse({
        content: "hola",
        model: "sonnet",
      }).success,
    ).toBe(true);
  });

  it("acepta request con history (modo preview sin restaurante)", () => {
    const ok = {
      content: "una nueva pregunta",
      model: "haiku",
      history: [
        { role: "user", content: "primer mensaje" },
        { role: "assistant", content: "primera respuesta" },
      ],
    };
    expect(PostMessageRequestSchema.safeParse(ok).success).toBe(true);
  });

  it("rechaza role inválido en history", () => {
    expect(
      PostMessageRequestSchema.safeParse({
        content: "x",
        history: [{ role: "system", content: "no" }],
      }).success,
    ).toBe(false);
  });

  it("rechaza history con más de 40 mensajes", () => {
    const big = Array.from({ length: 41 }, (_, i) => ({
      role: "user" as const,
      content: String(i),
    }));
    expect(
      PostMessageRequestSchema.safeParse({ content: "x", history: big })
        .success,
    ).toBe(false);
  });
});

describe("BulkMessagesRequestSchema (A-12)", () => {
  it("acepta un payload canónico para hidratar la conversation", () => {
    const ok = {
      messages: [
        { role: "user", content: "p1" },
        { role: "assistant", content: "r1" },
        { role: "user", content: "p2" },
        { role: "assistant", content: "r2" },
      ],
    };
    expect(BulkMessagesRequestSchema.safeParse(ok).success).toBe(true);
  });

  it("rechaza messages vacío (.min(1))", () => {
    expect(
      BulkMessagesRequestSchema.safeParse({ messages: [] }).success,
    ).toBe(false);
  });

  it("rechaza role inválido", () => {
    expect(
      BulkMessagesRequestSchema.safeParse({
        messages: [{ role: "tool", content: "no" }],
      }).success,
    ).toBe(false);
  });

  it("rechaza content vacío", () => {
    expect(
      BulkMessagesRequestSchema.safeParse({
        messages: [{ role: "user", content: "" }],
      }).success,
    ).toBe(false);
  });
});
