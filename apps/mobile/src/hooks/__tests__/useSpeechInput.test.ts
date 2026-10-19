import { describe, expect, it } from "vitest";
import { mergeDictation } from "../useSpeechInput";

describe("mergeDictation", () => {
  it("returns the dictated text when nothing was typed", () => {
    expect(mergeDictation("", "pichón con espuma")).toBe("pichón con espuma");
  });

  it("adds the dictated text after what was typed, with one space", () => {
    expect(mergeDictation("Pichón", "con espuma de café")).toBe("Pichón con espuma de café");
  });

  it("ignores spaces and line breaks around the typed text", () => {
    expect(mergeDictation("  Pichón \n", "con espuma")).toBe("Pichón con espuma");
    expect(mergeDictation("  \n", "con espuma")).toBe("con espuma");
  });
});
