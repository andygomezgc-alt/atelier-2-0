// Groups ingredient rows into consecutive runs of the same section, keeping
// their order. Rows without a section form unnamed groups (section null),
// which the recipe screen renders without a heading.

export type SectionGroup<T> = { section: string | null; rows: T[] };

export function groupBySection<T>(
  rows: readonly T[],
  sectionOf: (row: T) => string | null | undefined,
): SectionGroup<T>[] {
  const groups: SectionGroup<T>[] = [];
  for (const row of rows) {
    const section = sectionOf(row)?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.rows.push(row);
    else groups.push({ section, rows: [row] });
  }
  return groups;
}
