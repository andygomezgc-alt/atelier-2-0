// apps/api/lib/invoices/header.ts
// The parts of an invoice header that the read writes and the chef can correct: the supplier
// (one row per normalized name, created on first use) and the printed date.
import { prisma } from "@atelier/db";
import { normalizeSupplierName } from "./line-matching";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// A misread date ("2026-13-10", "2026-02-31") would fail the save, and a future one would date
// the price ahead and freeze it: such a date is dropped (null).
export function plausibleDate(raw: string | null, uploadedAt: Date): string | null {
  if (!raw || !DATE.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(+date) || date.toISOString().slice(0, 10) !== raw) return null;
  return +date <= +uploadedAt + DAY_MS ? raw : null;
}

export async function upsertSupplier(restaurantId: string, name: string | null, taxId: string | null): Promise<string | null> {
  const nameNorm = normalizeSupplierName(name ?? "");
  if (!name || nameNorm === "") return null;
  try {
    const supplier = await prisma.supplier.upsert({
      where: { restaurantId_nameNorm: { restaurantId, nameNorm } },
      create: { restaurantId, name: name.trim(), nameNorm, taxId },
      update: taxId ? { taxId } : {},
      select: { id: true },
    });
    return supplier.id;
  } catch (error) {
    // Two writes of the same new supplier race on the unique key: the loser reuses the winner's row.
    if ((error as { code?: unknown }).code !== "P2002") throw error;
    const existing = await prisma.supplier.findUnique({ where: { restaurantId_nameNorm: { restaurantId, nameNorm } }, select: { id: true } });
    return existing?.id ?? null;
  }
}
