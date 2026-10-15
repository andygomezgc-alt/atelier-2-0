// apps/api/app/api/invoices/[id]/route.ts
// GET: one invoice with its lines and the checks derived from them. DELETE: to the trash
// (purged with its files after 7 days, Task 15).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import type { InvoiceDetail, InvoiceLineView } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { loadMatchCandidates } from "@/lib/recipes/extraction-pipeline";
import { findMatch } from "@/lib/products/matching";
import { quantityLooksMisread } from "@/lib/invoices/pricing";
import { checkInvoiceTotals } from "@/lib/invoices/totals";
import { expireStuckReads, toInvoiceSummary } from "@/lib/invoices/views";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

export async function GET(req: NextRequest, { params }: Params) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;
  await expireStuckReads(ctx.restaurantId, new Date());

  const invoice = await prisma.invoice.findFirst({
    where: { id, restaurantId: ctx.restaurantId, deletedAt: null },
    include: {
      supplier: { select: { id: true, name: true } },
      pages: { orderBy: { position: "asc" }, select: { position: true, mimeType: true } },
      lines: {
        orderBy: { position: "asc" },
        include: { product: { select: { id: true, name: true, unidadCompra: true, precioCompra: true, taxRatePct: true } } },
      },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found", code: "invoice_not_found" }, { status: 404 });

  const duplicate = invoice.supplierId && invoice.number
    ? await prisma.invoice.findFirst({
        where: { id: { not: id }, restaurantId: ctx.restaurantId, supplierId: invoice.supplierId, number: invoice.number, deletedAt: null },
        select: { id: true }, orderBy: { createdAt: "asc" },
      })
    : null;
  const candidates = invoice.lines.some((l) => l.matchLevel === "ambiguo") ? await loadMatchCandidates(ctx.restaurantId) : [];

  const lines: InvoiceLineView[] = invoice.lines.map((l) => {
    const view = {
      quantity: num(l.quantity), unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents,
    };
    return {
      position: l.position, description: l.description, code: l.code, quantity: view.quantity, unit: l.unit,
      packQty: num(l.packQty), packUnit: l.packUnit, unitPriceCents: l.unitPriceCents, taxRatePct: num(l.taxRatePct),
      lineTotalCents: l.lineTotalCents, matchLevel: l.matchLevel as InvoiceLineView["matchLevel"], action: l.action,
      appliedPriceCents: l.appliedPriceCents,
      product: l.product ? { ...l.product, taxRatePct: l.product.taxRatePct.toNumber() } : null,
      siblings: l.matchLevel === "ambiguo" ? findMatch(l.description, candidates).candidates : [],
      quantityLooksMisread: quantityLooksMisread(view),
    };
  });

  const body: InvoiceDetail = {
    ...toInvoiceSummary(invoice),
    supplier: invoice.supplier,
    taxTotalCents: invoice.taxTotalCents,
    pages: invoice.pages,
    lines,
    checks: {
      totals: checkInvoiceTotals(lines, { netTotalCents: invoice.netTotalCents, grossTotalCents: invoice.grossTotalCents }),
      duplicateOf: duplicate?.id ?? null,
    },
  };
  return NextResponse.json(body);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;
  const moved = await prisma.invoice.updateMany({
    where: { id, restaurantId: ctx.restaurantId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (moved.count === 0) return NextResponse.json({ error: "Not found", code: "invoice_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
