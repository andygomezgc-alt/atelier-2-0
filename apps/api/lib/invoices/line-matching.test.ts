// apps/api/lib/invoices/line-matching.test.ts
import { describe, expect, it, vi } from "vitest";
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
import {
  matchInvoiceLines, normalizeCode, normalizeDescription, normalizeSupplierName, topCandidates,
  type SecondLook, type SupplierMemoryEntry,
} from "./line-matching";

const candidates = [
  { id: "calamari", name: "Calamari puliti", aliases: [] },
  { id: "cozze", name: "Cozze", aliases: [] },
  { id: "branzino", name: "Branzino", aliases: [] },
  { id: "g1", name: "Gambero rosso Mazara", aliases: [] },
  { id: "g2", name: "Gambero rosso Sicilia", aliases: [] },
];
const line = (description: string, over: Partial<{ code: string | null; packQty: number | null; packUnit: string | null; kind: "item" | "charge" }> = {}) =>
  ({ description, code: null, packQty: null, packUnit: null, kind: "item" as const, ...over });
const noLook: SecondLook = async () => new Map();

describe("normalizers", () => {
  it.each([
    ["JOLANDA DE COLO' spa", "jolanda de colo"],
    ["Jolanda De Colò S.p.A.", "jolanda de colo"],
    ["Scelgo SPA (C&C San Benedetto del Tronto)", "scelgo"],
    ["Recchioni Primo e Adolfo s.r.l.", "recchioni primo e adolfo"],
    ["GARDEN FRUIT s.r.l.", "garden fruit"],
  ])("supplier %j -> %j", (raw, expected) => expect(normalizeSupplierName(raw)).toBe(expected));

  it("description folds case, accents and punctuation", () =>
    expect(normalizeDescription("PIE' D'ASINO  Ñandú")).toBe("pie d asino nandu"));
  it.each([[" FRU 108 ", "FRU108"], ["", null], ["   ", null], [null, null]])("code %j -> %j", (raw, expected) =>
    expect(normalizeCode(raw)).toBe(expected));
});

describe("topCandidates", () => {
  it("ranks by shared words and leaves out products sharing none", () =>
    expect(topCandidates("Calamari puliti congelati IQF", candidates).map((c) => c.id)).toEqual(["calamari"]));
  it("returns at most the limit", () =>
    expect(topCandidates("gambero rosso", candidates, 1)).toHaveLength(1));
});

describe("matchInvoiceLines", () => {
  const memory: SupplierMemoryEntry[] = [
    { code: "CC3PPU", descriptionNorm: "calamari 3p puliti", productId: "calamari", packQty: null, packUnit: null },
    { code: null, descriptionNorm: "cozza arborea", productId: "cozze", packQty: 5, packUnit: "kg" },
  ];

  it("supplier memory by code wins over everything", async () => {
    const [m] = await matchInvoiceLines({ lines: [line("anything", { code: "CC3PPU" })], memory, candidates, secondLook: noLook });
    expect(m).toEqual({ productId: "calamari", level: "memory", packQty: null, packUnit: null });
  });

  it("supplier memory by description fills a pack the line did not print", async () => {
    const [m] = await matchInvoiceLines({ lines: [line("COZZA (ARBOREA)")], memory, candidates, secondLook: noLook });
    expect(m).toEqual({ productId: "cozze", level: "memory", packQty: 5, packUnit: "kg" });
  });

  it("a pack printed on the line wins over the remembered one", async () => {
    const [m] = await matchInvoiceLines({ lines: [line("COZZA (ARBOREA)", { packQty: 10, packUnit: "kg" })], memory, candidates, secondLook: noLook });
    expect(m).toMatchObject({ packQty: 10, packUnit: "kg" });
  });

  it("an exact bank match needs no AI", async () => {
    const secondLook = vi.fn<SecondLook>(async () => new Map());
    const [m] = await matchInvoiceLines({ lines: [line("Calamari puliti")], memory: [], candidates, secondLook });
    expect(m).toMatchObject({ productId: "calamari", level: "exact" });
    expect(secondLook).not.toHaveBeenCalled();
  });

  it("an ambiguous family is left for the chef, not the AI", async () => {
    const secondLook = vi.fn<SecondLook>(async () => new Map());
    const [m] = await matchInvoiceLines({ lines: [line("Gambero rosso")], memory: [], candidates, secondLook });
    expect(m).toMatchObject({ productId: null, level: "ambiguo" });
    expect(secondLook).not.toHaveBeenCalled();
  });

  it("charge lines are never matched", async () => {
    const [m] = await matchInvoiceLines({ lines: [line("DIFFERENZA CAUZIONALE", { kind: "charge" })], memory, candidates, secondLook: noLook });
    expect(m).toMatchObject({ productId: null, level: "charge" });
  });

  it("doubtful lines go to one AI call with their candidates; a valid pick becomes level ai", async () => {
    const secondLook = vi.fn<SecondLook>(async () => new Map([[0, "calamari"]]));
    const result = await matchInvoiceLines({
      lines: [line("Calamari puliti congelati IQF 3P"), line("Calamari puliti")],
      memory: [], candidates, secondLook,
    });
    expect(secondLook).toHaveBeenCalledTimes(1);
    expect(secondLook.mock.calls[0]![0]).toEqual([
      { position: 0, description: "Calamari puliti congelati IQF 3P", candidates: [{ id: "calamari", name: "Calamari puliti" }] },
    ]);
    expect(result[0]).toMatchObject({ productId: "calamari", level: "ai" });
    expect(result[1]).toMatchObject({ level: "exact" });
  });

  it("an AI pick outside the line's candidates is ignored", async () => {
    const [m] = await matchInvoiceLines({
      lines: [line("Calamari puliti congelati IQF 3P")], memory: [], candidates,
      secondLook: async () => new Map([[0, "branzino"]]),
    });
    expect(m).toMatchObject({ productId: "calamari", level: "probable" });
  });

  it("when the AI call fails, lines keep their rule-based level", async () => {
    const [m] = await matchInvoiceLines({
      lines: [line("Calamari puliti congelati IQF 3P")], memory: [], candidates,
      secondLook: async () => { throw new Error("ai_provider_http_503"); },
    });
    expect(m).toMatchObject({ productId: "calamari", level: "probable" });
  });
});
