// Guards against the model skipping rows in dense tables: the read lines must
// add up to the invoice's net total, allowing one cent of rounding per line.
export type TotalsCheck = { status: "ok" | "mismatch" | "unknown"; sumCents: number | null; diffCents: number | null };

export function checkTotals(lineTotalsCents: ReadonlyArray<number | null>, netTotalCents: number | null): TotalsCheck {
  if (lineTotalsCents.length === 0 || lineTotalsCents.some((v) => v === null)) {
    return { status: "unknown", sumCents: null, diffCents: null };
  }
  const sumCents = (lineTotalsCents as number[]).reduce((a, b) => a + b, 0);
  if (netTotalCents === null) return { status: "unknown", sumCents, diffCents: null };
  const diffCents = sumCents - netTotalCents;
  const tolerance = Math.max(2, lineTotalsCents.length);
  return { status: Math.abs(diffCents) <= tolerance ? "ok" : "mismatch", sumCents, diffCents };
}
