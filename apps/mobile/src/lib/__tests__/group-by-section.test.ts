import { describe, expect, it } from "vitest";
import { groupBySection } from "../group-by-section";

type Row = { id: string; section?: string | null };
const sectionOf = (r: Row) => r.section;

describe("groupBySection", () => {
  it("returns no groups for no rows", () => {
    expect(groupBySection([] as Row[], sectionOf)).toEqual([]);
  });

  it("keeps a recipe without sections as one unnamed group", () => {
    const rows: Row[] = [{ id: "a", section: null }, { id: "b" }];
    expect(groupBySection(rows, sectionOf)).toEqual([{ section: null, rows }]);
  });

  it("groups consecutive runs of the same section, in order", () => {
    const rows: Row[] = [
      { id: "a", section: null },
      { id: "b", section: "Farsa" },
      { id: "c", section: "Farsa" },
      { id: "d", section: "Salsa" },
    ];
    expect(groupBySection(rows, sectionOf)).toEqual([
      { section: null, rows: [rows[0]] },
      { section: "Farsa", rows: [rows[1], rows[2]] },
      { section: "Salsa", rows: [rows[3]] },
    ]);
  });

  it("starts a new group when a section comes back after another one", () => {
    const rows: Row[] = [
      { id: "a", section: "Farsa" },
      { id: "b", section: "Salsa" },
      { id: "c", section: "Farsa" },
    ];
    expect(groupBySection(rows, sectionOf).map((g) => g.section)).toEqual(["Farsa", "Salsa", "Farsa"]);
  });

  it("treats a blank section as no section", () => {
    const rows: Row[] = [{ id: "a", section: "  " }, { id: "b", section: null }];
    expect(groupBySection(rows, sectionOf)).toEqual([{ section: null, rows }]);
  });
});
