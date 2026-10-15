// apps/api/app/api/invoices/[id]/read/route.ts
// Closes the upload and reads the invoice in the background. The status claim
// (uploading -> reading) makes a double tap start one read only.
import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { readInvoiceSafely } from "@/lib/invoices/read-invoice";

export const dynamic = "force-dynamic";
// The after() read counts toward this limit; readInvoice stops itself at READ_DEADLINE_MS (Task 11).
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const claimed = await prisma.invoice.updateMany({
    where: { id, restaurantId: ctx.restaurantId, deletedAt: null, status: "uploading" },
    data: { status: "reading", failureReason: null },
  });
  if (claimed.count === 0) {
    const existing = await prisma.invoice.findFirst({ where: { id, restaurantId: ctx.restaurantId, deletedAt: null }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: "Not found", code: "invoice_not_found" }, { status: 404 });
    return NextResponse.json({ error: "The invoice is no longer uploading", code: "invoice_not_uploading" }, { status: 409 });
  }
  after(() => readInvoiceSafely(id));
  return NextResponse.json({ id, status: "reading" }, { status: 202 });
}
