// apps/api/app/api/invoices/[id]/pages/route.ts
// Adds one more photo to an invoice that is still uploading. A PDF is a whole invoice:
// it can only be the first file.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { MAX_INVOICE_PAGES, readUploadedPage } from "@/lib/invoices/upload";
import { deleteInvoiceFiles, InvoiceStorageError, storeInvoiceFile } from "@/lib/invoices/storage";

export const dynamic = "force-dynamic";

const conflict = (code: string, error: string) => NextResponse.json({ error, code }, { status: 409 });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, restaurantId: ctx.restaurantId, deletedAt: null },
    select: { id: true, status: true, pages: { select: { mimeType: true }, orderBy: { position: "asc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found", code: "invoice_not_found" }, { status: 404 });
  if (invoice.status !== "uploading") return conflict("invoice_not_uploading", "The invoice is no longer uploading");
  if (invoice.pages[0]?.mimeType === "application/pdf") return conflict("invoice_pdf_single_file", "A PDF invoice has a single file");
  if (invoice.pages.length >= MAX_INVOICE_PAGES) return conflict("invoice_too_many_pages", "Too many pages");

  const page = await readUploadedPage(await req.formData(), { imagesOnly: true });
  if ("status" in page) return NextResponse.json(page.body, { status: page.status });

  let storageKey: string;
  try {
    storageKey = await storeInvoiceFile(ctx.restaurantId, id, page.buffer, page.mimeType);
  } catch (error) {
    if (error instanceof InvoiceStorageError) {
      return NextResponse.json({ error: "Invoice storage unavailable", code: "invoice_storage_unavailable" }, { status: 503 });
    }
    throw error;
  }
  const position = invoice.pages.length;
  try {
    await prisma.invoicePage.create({ data: { invoiceId: id, position, storageKey, mimeType: page.mimeType, sizeBytes: page.sizeBytes } });
  } catch (error) {
    await deleteInvoiceFiles([storageKey]);
    if ((error as { code?: unknown }).code === "P2002") return conflict("invoice_page_conflict", "Another page took this position");
    throw error;
  }
  return NextResponse.json({ position }, { status: 201 });
}
