// apps/api/app/api/invoices/[id]/pages/[position]/route.ts
// Streams one original page to an authorized user of the same restaurant. The file is
// private: it is never cached by shared caches and its storage key never leaves the server.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { openInvoiceFile } from "@/lib/invoices/storage";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not found", code: "invoice_page_not_found" }, { status: 404 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; position: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id, position: raw } = await params;
  if (!/^\d+$/.test(raw)) return notFound();

  const page = await prisma.invoicePage.findFirst({
    where: { position: Number(raw), invoice: { id, restaurantId: ctx.restaurantId, deletedAt: null } },
    select: { storageKey: true },
  });
  if (!page) return notFound();
  const file = await openInvoiceFile(page.storageKey);
  if (!file) return notFound();
  return new Response(file.stream, { headers: { "Content-Type": file.contentType, "Cache-Control": "private, no-store" } });
}
