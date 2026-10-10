import { describe, expect, it } from "vitest";
import { CHEF_NOTES_MAX, ChefNoteSchema, ChefNotesResponseSchema, ChefNoteTextSchema, CreateChefNoteSchema } from "./chef-notes";

describe("notas del chef", () => {
  it("el máximo por restaurante es 10", () => {
    expect(CHEF_NOTES_MAX).toBe(10);
  });
  it("recorta el texto y lo exige de 1 a 160 caracteres", () => {
    expect(CreateChefNoteSchema.parse({ text: "  No usamos cerdo  " })).toEqual({ text: "No usamos cerdo" });
    expect(CreateChefNoteSchema.safeParse({ text: "" }).success).toBe(false);
    expect(CreateChefNoteSchema.safeParse({ text: "   \n " }).success).toBe(false);
    expect(CreateChefNoteSchema.safeParse({ text: "a".repeat(160) }).success).toBe(true);
    expect(CreateChefNoteSchema.safeParse({ text: "a".repeat(161) }).success).toBe(false);
    expect(CreateChefNoteSchema.safeParse({ text: `  ${"a".repeat(160)}  ` }).success).toBe(true);
  });
  it("rechaza campos extra y texto que no es cadena", () => {
    expect(CreateChefNoteSchema.safeParse({ text: "ok", restaurantId: "otro" }).success).toBe(false);
    expect(CreateChefNoteSchema.safeParse({ text: 5 }).success).toBe(false);
    expect(CreateChefNoteSchema.safeParse({}).success).toBe(false);
  });
  it.each([
    ["  Sin\tcerdo\n# Fake section  ", "Sin cerdo # Fake section"],
    ["Horno\r\n de   leña", "Horno de leña"],
    ["  Cocina\u00a0\u00a0vegetal\u2028sin\u2029lácteos  ", "Cocina vegetal sin lácteos"],
  ])("normaliza espacios internos antes de guardar: %j", (input, expected) => {
    expect(ChefNoteTextSchema.parse(input)).toBe(expected);
    expect(CreateChefNoteSchema.parse({ text: input })).toEqual({ text: expected });
  });
  it("aplica el límite de 160 caracteres al texto normalizado", () => {
    const prefix = "a".repeat(158);
    expect(ChefNoteTextSchema.parse(`${prefix}\n\t   b`)).toBe(`${prefix} b`);
    expect(ChefNoteTextSchema.safeParse(`${prefix}\n\t   bb`).success).toBe(false);
    expect(ChefNoteTextSchema.safeParse("\t\r\n\u00a0\u2028\u2029").success).toBe(false);
  });
  it("normaliza también las notas antiguas en el contrato de respuesta", () => {
    const note = { id: "n1", text: "  Sin\n# Fake section\t  ", createdAt: "2026-09-29T10:00:00.000Z" };
    const expected = { ...note, text: "Sin # Fake section" };
    expect(ChefNoteSchema.parse(note)).toEqual(expected);
    expect(ChefNotesResponseSchema.parse({ notes: [note], canEdit: true }))
      .toEqual({ notes: [expected], canEdit: true });
  });
  it("la respuesta lleva id, texto y fecha ISO", () => {
    const note = { id: "n1", text: "Horno de leña", createdAt: "2026-09-29T10:00:00.000Z" };
    expect(ChefNoteSchema.parse(note)).toEqual(note);
    expect(ChefNoteSchema.safeParse({ ...note, createdAt: "ayer" }).success).toBe(false);
    expect(ChefNotesResponseSchema.parse({ notes: [note], canEdit: true })).toEqual({ notes: [note], canEdit: true });
    expect(ChefNotesResponseSchema.safeParse({ notes: [note] }).success).toBe(false);
  });
});
