// apps/api/lib/invoices/apply.ts
// Applies a reviewed invoice in one transaction: claim review -> applied, refuse undecided
// lines, then write prices, drafts and links. Supplier memory is written after the commit,
// best effort: a cache must never roll back prices.
import { prisma, type ProductUnit } from "@atelier/db";
import { createDraftProduct } from "../products/drafts";
import { logger } from "../logger";
import { draftUnitFor } from "./pricing";
import { rememberSupplierItems, type MemoryEntry } from "./supplier-memory";

type Skipped = { position: number; reason: "product_deleted" | "newer_price" };
export type ApplyResult =
  | { status: "applied"; updated: number; drafts: number; connected: number; ignored: number; skipped: Skipped[]; priceRises: number; affectedRecipes: number }
  | { status: "already_applied" }
  | { status: "error"; code: "invoice_not_found" | "invoice_not_in_review" | "lines_undecided"; positions?: number[] };

class Undecided extends Error {
  constructor(readonly positions: number[]) { super("lines_undecided"); }
}

const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

export async function applyInvoice(input: { invoiceId: string; restaurantId: string; userId: string; now?: Date }): Promise<ApplyResult> {
  const now = input.now ?? new Date();
  const { invoiceId, restaurantId, userId } = input;
  const remembered: MemoryEntry[] = [];
  let supplierId: string | null = null;

  let result: ApplyResult;
  try {
    result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, restaurantId, deletedAt: null }, select: { status: true, supplierId: true, issuedOn: true } });
      if (!invoice) return { status: "error", code: "invoice_not_found" } as const;
      const claimed = await tx.invoice.updateMany({ where: { id: invoiceId, status: "review" }, data: { status: "applied", appliedAt: now } });
      if (claimed.count === 0) {
        // The status read above may predate a concurrent apply that committed while this claim waited.
        const current = await tx.invoice.findFirst({ where: { id: invoiceId }, select: { status: true } });
        return current?.status === "applied" ? ({ status: "already_applied" } as const) : ({ status: "error", code: "invoice_not_in_review" } as const);
      }
      supplierId = invoice.supplierId;

      const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, orderBy: { position: "asc" } });
      const undecided = lines.filter((l) => l.action === null).map((l) => l.position);
      if (undecided.length > 0) throw new Undecided(undecided);

      // The invoice's own day at noon UTC: the same calendar day in every European time zone (minor #5),
      // never later than now, so a price is never dated ahead of when it was applied.
      const invoiceNoon = invoice.issuedOn ? new Date(`${invoice.issuedOn.toISOString().slice(0, 10)}T12:00:00Z`) : now;
      const priceAt = invoiceNoon > now ? now : invoiceNoon;
      const counts = { updated: 0, drafts: 0, connected: 0, ignored: 0 };
      const skipped: Skipped[] = [];
      // Price before this invoice and after it, per product: two lines for one product count once, by their net change,
      // and leave one history row with the final price (written after the loop, from the last line).
      const priceMoves = new Map<string, { from: number; to: number; unit: ProductUnit; lineId: string }>();

      for (const line of lines) {
        const taxRatePct = num(line.taxRatePct);
        const memory = (productId: string) =>
          remembered.push({ code: line.code, description: line.description, productId, packQty: num(line.packQty), packUnit: line.packUnit, priceCents: line.appliedPriceCents });

        if (line.action === "ignore") { counts.ignored++; continue; }

        if (line.action === "create_draft") {
          const unit = draftUnitFor({ unit: line.unit, packQty: num(line.packQty), packUnit: line.packUnit });
          const mermaPct = num(line.draftMermaPct);
          const created = await createDraftProduct(tx, {
            restaurantId, name: line.draftName ?? line.description,
            ...(line.draftCategory ? { category: line.draftCategory } : {}),
            ...(mermaPct !== null ? { mermaPct, ...(line.draftMermaReason ? { mermaMotivo: line.draftMermaReason } : {}) } : {}),
            ...(unit ? { unidadCompra: unit } : {}),
            precioCompra: line.appliedPriceCents ?? 0, taxRatePct, precioActualizadoAt: priceAt,
          });
          await tx.invoiceLine.update({ where: { id: line.id }, data: { productId: created.id } });
          if (line.appliedPriceCents !== null && unit) {
            await tx.productPriceHistory.create({ data: { productId: created.id, authorId: userId, precio: line.appliedPriceCents, unidadCompra: unit, invoiceLineId: line.id } });
          }
          memory(created.id);
          counts.drafts++;
          continue;
        }

        const product = line.productId
          ? await tx.product.findFirst({ where: { id: line.productId, restaurantId, deletedAt: null }, select: { id: true, unidadCompra: true, precioCompra: true, precioActualizadoAt: true } })
          : null;
        if (!product) { skipped.push({ position: line.position, reason: "product_deleted" }); continue; }

        if (line.action === "connect") { memory(product.id); counts.connected++; continue; }

        // update_price. A price set from a newer invoice (or by hand later) stays.
        if (product.precioCompra > 0 && product.precioActualizadoAt && product.precioActualizadoAt > priceAt) {
          skipped.push({ position: line.position, reason: "newer_price" });
          continue;
        }
        const price = line.appliedPriceCents!;
        await tx.product.update({
          where: { id: product.id },
          data: { precioCompra: price, precioActualizadoAt: priceAt, ...(taxRatePct !== null ? { taxRatePct } : {}) },
        });
        priceMoves.set(product.id, { from: priceMoves.get(product.id)?.from ?? product.precioCompra, to: price, unit: product.unidadCompra, lineId: line.id });
        memory(product.id);
        counts.updated++;
      }
      // The product list compares the two newest history rows, so an in-between price from this same invoice
      // would compare the invoice against itself instead of against the price before it.
      for (const [productId, move] of priceMoves) {
        await tx.productPriceHistory.create({ data: { productId, authorId: userId, precio: move.to, unidadCompra: move.unit, invoiceLineId: move.lineId } });
      }
      // A first price (from zero) is not a rise. Recipes in the trash are not counted.
      const risen = [...priceMoves].filter(([, move]) => move.from > 0 && move.to > move.from).map(([id]) => id);
      const affected = risen.length > 0
        ? await tx.recipeIngredient.findMany({ where: { productId: { in: risen }, recipe: { deletedAt: null } }, select: { recipeId: true }, distinct: ["recipeId"] })
        : [];
      return { status: "applied", ...counts, skipped, priceRises: risen.length, affectedRecipes: affected.length } as const;
    }, { timeout: 30_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof Undecided) return { status: "error", code: "lines_undecided", positions: error.positions };
    throw error;
  }

  if (result.status === "applied" && supplierId && remembered.length > 0) {
    try {
      await rememberSupplierItems(supplierId, remembered);
    } catch (error) {
      logger.warn("invoice_memory_failed", { invoiceId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (result.status === "applied") logger.info("invoice_applied", { invoiceId, ...result, skipped: result.skipped.length });
  return result;
}
