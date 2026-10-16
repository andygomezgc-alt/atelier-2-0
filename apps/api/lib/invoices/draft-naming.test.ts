// apps/api/lib/invoices/draft-naming.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { glm } = vi.hoisted(() => ({ glm: { generateGlmJson: vi.fn() } }));
vi.mock("../ai/glm", () => glm);
import { nameDrafts } from "./draft-naming";

const requests = [
  { position: 0, description: "CALAMARI 3P PULITI IQF CONGELATI - Loligo vulgaris LOTTO FORNITORE: 02-17/26", unit: "KG", packQty: null, packUnit: null },
  { position: 4, description: "OSTRICA GILLARDEAU 4 (kg 1,75 -pz24) All.Francia", unit: "PZ", packQty: 24, packUnit: "pz" },
];

beforeEach(() => glm.generateGlmJson.mockReset());

describe("nameDrafts", () => {
  it("makes no call when no line becomes a new product", async () => {
    expect(await nameDrafts([])).toEqual(new Map());
    expect(glm.generateGlmJson).not.toHaveBeenCalled();
  });

  it("sends every new-product line in one text call", async () => {
    glm.generateGlmJson.mockResolvedValue({ items: [] });
    await nameDrafts(requests);
    expect(glm.generateGlmJson).toHaveBeenCalledTimes(1);
    const req = glm.generateGlmJson.mock.calls[0]![0] as { task: string; content: string };
    expect(req.task).toBe("extraction");
    expect(JSON.parse(req.content)).toEqual({ lines: requests });
  });

  it("returns the clean name, category and suggested waste with its reason", async () => {
    glm.generateGlmJson.mockResolvedValue({ items: [
      { position: 0, name: " Calamari puliti IQF 3P congelati ", category: "pescado", wastePct: 0, wasteReason: "Comprati già puliti" },
      { position: 4, name: "Ostrica Gillardeau n. 4", category: "pescado", wastePct: 15, wasteReason: "Guscio e acqua" },
    ] });
    expect(await nameDrafts(requests)).toEqual(new Map([
      [0, { name: "Calamari puliti IQF 3P congelati", category: "pescado", mermaPct: 0, mermaReason: "Comprati già puliti" }],
      [4, { name: "Ostrica Gillardeau n. 4", category: "pescado", mermaPct: 15, mermaReason: "Guscio e acqua" }],
    ]));
  });

  it("drops answers for positions it did not ask about", async () => {
    glm.generateGlmJson.mockResolvedValue({ items: [{ position: 9, name: "Rucola", category: "verdura", wastePct: 5, wasteReason: "x" }] });
    expect(await nameDrafts(requests)).toEqual(new Map());
  });

  it("keeps a valid name even when the category or waste is unusable", async () => {
    glm.generateGlmJson.mockResolvedValue({ items: [
      { position: 0, name: "Calamari puliti", category: "molluschi", wastePct: "tanta", wasteReason: "x" },
      { position: 4, name: "Ostrica Gillardeau n. 4", category: "pescado", wastePct: 150 },
    ] });
    expect(await nameDrafts(requests)).toEqual(new Map([
      [0, { name: "Calamari puliti", category: null, mermaPct: null, mermaReason: null }],
      [4, { name: "Ostrica Gillardeau n. 4", category: "pescado", mermaPct: null, mermaReason: null }],
    ]));
  });

  it("ignores an empty name and rounds the waste to one decimal", async () => {
    glm.generateGlmJson.mockResolvedValue({ items: [
      { position: 0, name: "   ", category: "pescado", wastePct: 10 },
      { position: 4, name: "Ostrica", category: "pescado", wastePct: 12.345, wasteReason: "Guscio" },
    ] });
    expect(await nameDrafts(requests)).toEqual(new Map([[4, { name: "Ostrica", category: "pescado", mermaPct: 12.3, mermaReason: "Guscio" }]]));
  });

  it("a malformed answer means no suggestions", async () => {
    glm.generateGlmJson.mockResolvedValue({ items: "nope" });
    expect(await nameDrafts(requests)).toEqual(new Map());
  });
});
