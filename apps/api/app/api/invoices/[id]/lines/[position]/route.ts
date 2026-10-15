// apps/api/app/api/invoices/[id]/lines/[position]/route.ts
// The chef's decision on one line of an invoice under review. Fenced on the invoice still
// being in review, so nothing changes on an invoice applied meanwhile.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { invoiceLinePatchSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { draftUnitFor, priceInBankUnit } from "@/lib/invoices/pricing";

export const dynamic = "force-dynamic";

const fail = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status });
const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; position: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id, position: raw } = await params;
  if (!/^\d+$/.test(raw)) return fail(404, "invoice_line_not_found", "Not found");
  const parsed = invoiceLinePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_body", "Invalid body");
  const body = parsed.data;

  const line = await prisma.invoiceLine.findFirst({
    where: { position: Number(raw), invoice: { id, restaurantId: ctx.restaurantId, deletedAt: null } },
    select: {
      id: true, position: true, description: true, quantity: true, unit: true, packQty: true, packUnit: true,
      unitPriceCents: true, lineTotalCents: true, productId: true, matchLevel: true, appliedPriceCents: true,
      invoice: { select: { status: true } },
    },
  });
  if (!line) return fail(404, "invoice_line_not_found", "Not found");
  if (line.invoice.status !== "review") return fail(409, "invoice_not_in_review", "The invoice is not in review");

  const priced = { ...line, quantity: num(line.quantity), packQty: num(line.packQty) };
  let productId: string | null = null;
  let price = body.priceCents !== undefined ? body.priceCents : line.appliedPriceCents;
  let matchLevel = line.matchLevel;

  if (body.action === "update_price" || body.action === "connect") {
    productId = body.productId ?? line.productId;
    if (!productId) return fail(400, "product_required", "Choose a product");
    const product = await prisma.product.findFirst({
      where: { id: productId, restaurantId: ctx.restaurantId, deletedAt: null },
      select: { id: true, unidadCompra: true },
    });
    if (!product) return fail(404, "product_not_found", "Product not found");
    if (productId !== line.productId) {
      matchLevel = "chef";
      if (body.priceCents === undefined) price = priceInBankUnit(priced, product.unidadCompra);
    }
  } else if (body.action === "create_draft" && body.priceCents === undefined && line.productId !== null) {
    const unit = draftUnitFor(priced);
    price = unit ? priceInBankUnit(priced, unit) : null;
  }
  if (body.action === "ignore") price = null;
  if (body.action === "update_price" && price === null) return fail(400, "price_required", "Enter a price");

  const data = { action: body.action, productId, appliedPriceCents: price, matchLevel };
  const updated = await prisma.invoiceLine.updateMany({ where: { id: line.id, invoice: { status: "review" } }, data });
  if (updated.count === 0) return fail(409, "invoice_not_in_review", "The invoice is not in review");
  return NextResponse.json({ position: line.position, ...data });
}
