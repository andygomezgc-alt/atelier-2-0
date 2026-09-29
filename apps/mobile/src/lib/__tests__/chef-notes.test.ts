import { describe, expect, it } from "vitest";
import { CHEF_NOTE_MAX_LENGTH, canRememberNote, isNoteTextValid, noteDraftFromMessage } from "../chef-notes";

describe("noteDraftFromMessage", () => {
  it("collapses every run of whitespace into one space and trims the ends", () => {
    expect(noteDraftFromMessage("  No usamos\n\ncerdo.\t Horno   de leña.  ")).toBe("No usamos cerdo. Horno de leña.");
  });

  it("keeps short text unchanged", () => {
    expect(noteDraftFromMessage("Sin gluten")).toBe("Sin gluten");
  });

  it("clamps long text to the note limit", () => {
    const draft = noteDraftFromMessage("a".repeat(400));
    expect(CHEF_NOTE_MAX_LENGTH).toBe(160);
    expect(draft).toBe("a".repeat(160));
  });

  it("clamps after collapsing, so spaces do not waste the limit", () => {
    const draft = noteDraftFromMessage(`${"b".repeat(150)}\n\n\n\n\n\n\n\n\n\n${"c".repeat(20)}`);
    expect(draft).toBe(`${"b".repeat(150)} ${"c".repeat(9)}`);
  });

  it("never cuts an emoji in half at the limit", () => {
    const draft = noteDraftFromMessage(`${"a".repeat(159)}😀 fin`);
    expect(draft).toBe("a".repeat(159));
    expect(isNoteTextValid(`${"a".repeat(158)}😀`)).toBe(true);
    expect(noteDraftFromMessage(`${"a".repeat(158)}😀 fin`)).toBe(`${"a".repeat(158)}😀`);
  });

  it("does not leave a trailing space after clamping", () => {
    expect(noteDraftFromMessage(`${"a".repeat(159)} bcd`)).toBe("a".repeat(159));
  });
});

describe("isNoteTextValid", () => {
  it("accepts 1 to 160 characters after trimming", () => {
    expect(isNoteTextValid(" x ")).toBe(true);
    expect(isNoteTextValid("a".repeat(160))).toBe(true);
  });

  it("rejects empty, blank or too long text", () => {
    expect(isNoteTextValid("")).toBe(false);
    expect(isNoteTextValid("   \n ")).toBe(false);
    expect(isNoteTextValid("a".repeat(161))).toBe(false);
  });
});

describe("canRememberNote", () => {
  it("allows roles that approve recipes inside a real restaurant", () => {
    expect(canRememberNote("admin", "restaurant-1")).toBe(true);
    expect(canRememberNote("chef_executive", "restaurant-1")).toBe(true);
  });

  it("hides the action from other roles", () => {
    expect(canRememberNote("sous_chef", "restaurant-1")).toBe(false);
    expect(canRememberNote("viewer", "restaurant-1")).toBe(false);
    expect(canRememberNote(null, "restaurant-1")).toBe(false);
  });

  it("hides the action in the preview without a restaurant", () => {
    expect(canRememberNote("chef_executive", null)).toBe(false);
    expect(canRememberNote("admin", undefined)).toBe(false);
    expect(canRememberNote("admin", "")).toBe(false);
  });
});
