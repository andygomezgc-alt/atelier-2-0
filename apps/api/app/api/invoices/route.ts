// apps/api/app/api/invoices/route.ts
// POST: first page of a new invoice (multipart field "file"). The invoice stays in
// "uploading" until POST /api/invoices/[id]/read. GET: the archive grouped by supplier.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { readUploadedPage } from "@/lib/invoices/upload";
import { InvoiceStorageError, storeInvoiceFile } from "@/lib/invoices/storage";
import { logger } from "@/lib/logger";
import { expireStuckReads, groupBySupplier } from "@/lib/invoices/views";
import type { InvoiceListResponse } from "@atelier/shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  await expireStuckReads(ctx.restaurantId, new Date());
  const rows = await prisma.invoice.findMany({
    where: { restaurantId: ctx.restaurantId, deletedAt: null, status: { not: "uploading" } },
    select: {
      id: true, status: true, number: true, issuedOn: true, grossTotalCents: true, netTotalCents: true,
      failureReason: true, createdAt: true, supplier: { select: { id: true, name: true } },
    },
  });
  const body: InvoiceListResponse = {
    toReview: rows.filter((r) => r.status === "review").length,
    suppliers: groupBySupplier(rows),
  };
  return NextResponse.json(body);
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const page = await readUploadedPage(await req.formData(), { imagesOnly: false });
  if ("status" in page) return NextResponse.json(page.body, { status: page.status });

  const invoice = await prisma.invoice.create({
    data: { restaurantId: ctx.restaurantId, uploadedById: ctx.userId, status: "uploading" },
    select: { id: true },
  });
  try {
    const storageKey = await storeInvoiceFile(ctx.restaurantId, invoice.id, page.buffer, page.mimeType);
    await prisma.invoicePage.create({
      data: { invoiceId: invoice.id, position: 0, storageKey, mimeType: page.mimeType, sizeBytes: page.sizeBytes },
    });
  } catch (error) {
    try {
      await prisma.invoice.delete({ where: { id: invoice.id } });
    } catch {
      // The abandoned "uploading" row is purged after a day (Task 15).
    }
    if (error instanceof InvoiceStorageError) {
      return NextResponse.json({ error: "Invoice storage unavailable", code: "invoice_storage_unavailable" }, { status: 503 });
    }
    throw error;
  }
  logger.info("invoice_upload_started", { invoiceId: invoice.id, mimeType: page.mimeType, bytes: page.sizeBytes });
  return NextResponse.json({ id: invoice.id, pages: 1 }, { status: 201 });
}
