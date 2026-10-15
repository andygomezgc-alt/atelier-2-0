// apps/api/app/api/invoices/[id]/retry/route.ts
// Reads a failed invoice again (failed -> reading), in the background.
import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { readInvoiceSafely } from "@/lib/invoices/read-invoice";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;
  const claimed = await prisma.invoice.updateMany({
    where: { id, restaurantId: ctx.restaurantId, deletedAt: null, status: "failed" },
    data: { status: "reading", failureReason: null },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Only a failed invoice can be read again", code: "invoice_not_failed" }, { status: 409 });
  }
  after(() => readInvoiceSafely(id));
  return NextResponse.json({ id, status: "reading" }, { status: 202 });
}
