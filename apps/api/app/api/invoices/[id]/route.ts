// apps/api/app/api/invoices/[id]/route.ts
// GET: one invoice with its lines and the checks derived from them. PATCH: the chef's header
// corrections, only while in review. DELETE: to the trash (purged with its files after 7 days, Task 15).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { invoiceHeaderPatchSchema, type InvoiceDetail, type InvoiceLineView } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { loadMatchCandidates } from "@/lib/recipes/extraction-pipeline";
import { findMatch } from "@/lib/products/matching";
import { plausibleDate, upsertSupplier } from "@/lib/invoices/header";
import { quantityLooksMisread } from "@/lib/invoices/pricing";
import { checkInvoiceTotals } from "@/lib/invoices/totals";
import { expireStuckReads, toInvoiceSummary } from "@/lib/invoices/views";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());
const fail = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status });

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
      draft: l.draftName
        ? { name: l.draftName, category: l.draftCategory, mermaPct: num(l.draftMermaPct), mermaReason: l.draftMermaReason }
        : null,
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

export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;
  const parsed = invoiceHeaderPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_body", "Invalid body");
  const body = parsed.data;
  if (body.issuedOn && !plausibleDate(body.issuedOn, new Date())) return fail(400, "invalid_body", "Invalid date");

  const invoice = await prisma.invoice.findFirst({ where: { id, restaurantId: ctx.restaurantId, deletedAt: null }, select: { status: true } });
  if (!invoice) return fail(404, "invoice_not_found", "Not found");
  if (invoice.status !== "review") return fail(409, "invoice_not_in_review", "The invoice is not in review");

  const data: { supplierId?: string; number?: string | null; issuedOn?: Date | null } = {};
  if (body.supplierId !== undefined) {
    const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, restaurantId: ctx.restaurantId }, select: { id: true } });
    if (!supplier) return fail(404, "supplier_not_found", "Supplier not found");
    data.supplierId = supplier.id;
  }
  if (body.supplierName !== undefined) {
    const supplierId = await upsertSupplier(ctx.restaurantId, body.supplierName, null);
    if (!supplierId) return fail(400, "invalid_body", "Invalid supplier name");
    data.supplierId = supplierId;
  }
  if (body.number !== undefined) data.number = body.number || null;
  if (body.issuedOn !== undefined) data.issuedOn = body.issuedOn ? new Date(`${body.issuedOn}T00:00:00Z`) : null;

  const updated = await prisma.invoice.updateMany({ where: { id, restaurantId: ctx.restaurantId, deletedAt: null, status: "review" }, data });
  if (updated.count === 0) return fail(409, "invoice_not_in_review", "The invoice is not in review");
  return NextResponse.json({ ok: true });
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
