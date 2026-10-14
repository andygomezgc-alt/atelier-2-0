import { describe, expect, it } from "vitest";
import { checkTotals } from "./totals";

describe("checkTotals", () => {
  it("ok when lines add up to the net total", () => {
    expect(checkTotals([4000, 1250], 5250)).toEqual({ status: "ok", sumCents: 5250, diffCents: 0 });
  });

  it("tolerates rounding of one cent per line", () => {
    expect(checkTotals([3333, 3333, 3333], 10001).status).toBe("ok");
  });

  it("mismatch when a line is missing", () => {
    expect(checkTotals([4000], 5250)).toEqual({ status: "mismatch", sumCents: 4000, diffCents: -1250 });
  });

  it("counts discount and deposit lines with their sign", () => {
    expect(checkTotals([4000, 1250, -500], 4750).status).toBe("ok");
  });

  it("unknown when the net total was not read", () => {
    expect(checkTotals([4000], null)).toEqual({ status: "unknown", sumCents: 4000, diffCents: null });
  });

  it("unknown when any line total was not read", () => {
    expect(checkTotals([4000, null], 5250)).toEqual({ status: "unknown", sumCents: null, diffCents: null });
  });

  it("unknown when there are no lines", () => {
    expect(checkTotals([], 5250).status).toBe("unknown");
  });
});
