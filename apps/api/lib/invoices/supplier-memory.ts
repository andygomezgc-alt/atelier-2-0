// apps/api/lib/invoices/supplier-memory.ts
// What the chef confirmed on an applied invoice: "this code / description from this supplier
// is that product". A cache for the next invoice, so every write is best effort.
import { prisma } from "@atelier/db";
import { logger } from "../logger";
import { normalizeCode, normalizeDescription } from "./line-matching";

export type MemoryEntry = { code: string | null; description: string; productId: string; packQty: number | null; packUnit: string | null; priceCents: number | null };

export async function rememberSupplierItems(supplierId: string, entries: ReadonlyArray<MemoryEntry>): Promise<void> {
  for (const entry of entries) {
    const code = normalizeCode(entry.code);
    const descriptionNorm = normalizeDescription(entry.description);
    const fields = { productId: entry.productId, packQty: entry.packQty, packUnit: entry.packUnit, lastPriceCents: entry.priceCents };
    try {
      const byCode = code ? await prisma.supplierItem.findUnique({ where: { supplierId_code: { supplierId, code } }, select: { id: true } }) : null;
      if (byCode) {
        await prisma.supplierItem.update({ where: { id: byCode.id }, data: fields });
        continue;
      }
      await prisma.supplierItem.upsert({
        where: { supplierId_descriptionNorm: { supplierId, descriptionNorm } },
        create: { supplierId, code, descriptionNorm, ...fields },
        update: code ? { code, ...fields } : fields,
      });
    } catch (error) {
      const errorCode = (error as { code?: unknown }).code;
      logger.warn("invoice_memory_failed", { supplierId, code: typeof errorCode === "string" ? errorCode : undefined, message: error instanceof Error ? error.message : String(error) });
    }
  }
}
