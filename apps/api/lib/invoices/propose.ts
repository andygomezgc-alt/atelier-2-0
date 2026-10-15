// apps/api/lib/invoices/propose.ts
// Turns the read lines of one invoice into review proposals: product, match level, price
// in the product's unit and the pre-selected action. action null = the chef decides.
import { prisma } from "@atelier/db";
import { loadMatchCandidates } from "../recipes/extraction-pipeline";
import type { ExtractedInvoiceLine } from "./extraction";
import { matchInvoiceLines, type LineMatchLevel, type SecondLook } from "./line-matching";
import { draftUnitFor, priceInBankUnit, proposeLine } from "./pricing";

export type ProposedLine = ExtractedInvoiceLine & {
  position: number;
  productId: string | null;
  matchLevel: LineMatchLevel;
  action: "update_price" | "create_draft" | "connect" | "ignore" | null;
  appliedPriceCents: number | null;
};

const toNumber = (v: { toNumber(): number } | number | null) => (v === null ? null : typeof v === "number" ? v : v.toNumber());

export async function proposeInvoiceLines(input: {
  restaurantId: string;
  supplierId: string | null;
  invoiceDate: string;
  lines: ReadonlyArray<ExtractedInvoiceLine>;
  secondLook: SecondLook;
}): Promise<ProposedLine[]> {
  const [memoryRows, candidates] = await Promise.all([
    input.supplierId
      ? prisma.supplierItem.findMany({
          where: { supplierId: input.supplierId, product: { restaurantId: input.restaurantId, deletedAt: null } },
          select: { code: true, descriptionNorm: true, productId: true, packQty: true, packUnit: true },
        })
      : Promise.resolve([]),
    loadMatchCandidates(input.restaurantId),
  ]);
  const memory = memoryRows.map((m) => ({ ...m, packQty: toNumber(m.packQty) }));
  const matches = await matchInvoiceLines({ lines: input.lines, memory, candidates, secondLook: input.secondLook });

  const ids = [...new Set(matches.flatMap((m) => (m.productId ? [m.productId] : [])))];
  const products = new Map(
    (ids.length === 0 ? [] : await prisma.product.findMany({
      where: { id: { in: ids }, restaurantId: input.restaurantId, deletedAt: null },
      select: { id: true, precioCompra: true, unidadCompra: true, precioActualizadoAt: true },
    })).map((p) => [p.id, p] as const),
  );

  return input.lines.map((line, position) => {
    const match = matches[position]!;
    const effective = { ...line, packQty: match.packQty, packUnit: match.packUnit };
    const product = match.productId ? products.get(match.productId) : undefined;
    const bankUnit = product?.unidadCompra ?? draftUnitFor(effective);
    const price = line.kind === "charge" || !bankUnit ? null : priceInBankUnit(effective, bankUnit);
    const proposal = proposeLine({
      productId: product?.id ?? null,
      currentPriceCents: product?.precioCompra ?? 0,
      currentPriceAt: product?.precioActualizadoAt ?? null,
      newPriceCents: price,
      invoiceDate: input.invoiceDate,
      kind: line.kind,
    });
    const undecided =
      match.level === "ambiguo" || match.level === "probable" || (proposal.action === "update_price" && !proposal.preselected);
    return {
      ...effective,
      position,
      productId: product?.id ?? null,
      matchLevel: match.level,
      action: undecided ? null : proposal.action,
      appliedPriceCents: line.kind === "charge" ? null : price,
    };
  });
}
