// apps/api/lib/invoices/second-look.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { glm } = vi.hoisted(() => ({ glm: { generateGlmJson: vi.fn() } }));
vi.mock("../ai/glm", () => glm);
import { secondLook } from "./second-look";

const requests = [
  { position: 0, description: "CALAMARI 3P PULITI IQF", candidates: [{ id: "calamari", name: "Calamari puliti" }] },
  { position: 3, description: "FASOLARO", candidates: [{ id: "fasolari", name: "Fasolari" }, { id: "vongole", name: "Vongole" }] },
];

beforeEach(() => glm.generateGlmJson.mockReset());

describe("secondLook", () => {
  it("makes no call when nothing is in doubt", async () => {
    expect(await secondLook([])).toEqual(new Map());
    expect(glm.generateGlmJson).not.toHaveBeenCalled();
  });

  it("sends every doubtful line with its candidates in one text call", async () => {
    glm.generateGlmJson.mockResolvedValue({ answers: [] });
    await secondLook(requests);
    expect(glm.generateGlmJson).toHaveBeenCalledTimes(1);
    const req = glm.generateGlmJson.mock.calls[0]![0] as { task: string; content: string };
    expect(req.task).toBe("extraction");
    expect(JSON.parse(req.content)).toEqual({ lines: requests });
  });

  it("keeps picks among the line's candidates and nulls the rest", async () => {
    glm.generateGlmJson.mockResolvedValue({ answers: [{ position: 0, productId: "calamari" }, { position: 3, productId: "calamari" }, { position: 9, productId: "x" }] });
    expect(await secondLook(requests)).toEqual(new Map([[0, "calamari"], [3, null]]));
  });

  it("a malformed answer means no picks", async () => {
    glm.generateGlmJson.mockResolvedValue({ answers: "nope" });
    expect(await secondLook(requests)).toEqual(new Map());
  });
});
