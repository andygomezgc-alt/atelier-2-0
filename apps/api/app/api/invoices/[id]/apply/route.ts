// apps/api/app/api/invoices/[id]/apply/route.ts
// Applies a reviewed invoice: prices, drafts and links in one transaction. Idempotent: a second
// call returns alreadyApplied.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { applyInvoice } from "@/lib/invoices/apply";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;
  const result = await applyInvoice({ invoiceId: id, restaurantId: ctx.restaurantId, userId: ctx.userId });
  if (result.status === "already_applied") return NextResponse.json({ alreadyApplied: true });
  if (result.status === "error") {
    return NextResponse.json(
      { error: result.code, code: result.code, ...(result.positions ? { positions: result.positions } : {}) },
      { status: result.code === "invoice_not_found" ? 404 : 409 },
    );
  }
  const { status: _status, ...counts } = result;
  return NextResponse.json(counts);
}
