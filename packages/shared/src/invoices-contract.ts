// packages/shared/src/invoices-contract.ts
// Shapes of the invoice routes, shared with the mobile app (Plan 3).
import { z } from "zod";
import type { AmbiguousCandidate } from "./api-contract";
import type { ProductCategory } from "./types";

export type InvoiceStatus = "uploading" | "reading" | "review" | "applied" | "failed";
export type InvoiceLineAction = "update_price" | "create_draft" | "connect" | "ignore";
export type InvoiceMatchLevel = "memory" | "exact" | "ai" | "probable" | "ambiguo" | "none" | "charge" | "chef";

export type InvoiceSummary = {
  id: string;
  status: InvoiceStatus;
  number: string | null;
  issuedOn: string | null; // YYYY-MM-DD
  grossTotalCents: number | null;
  netTotalCents: number | null;
  failureReason: string | null;
  createdAt: string;
};
export type InvoiceListResponse = {
  toReview: number;
  suppliers: Array<{ supplier: { id: string; name: string } | null; invoices: InvoiceSummary[] }>;
};

export type InvoiceLineView = {
  position: number;
  description: string;
  code: string | null;
  quantity: number | null;
  unit: string | null;
  packQty: number | null;
  packUnit: string | null;
  unitPriceCents: number | null;
  taxRatePct: number | null;
  lineTotalCents: number | null;
  matchLevel: InvoiceMatchLevel | null;
  action: InvoiceLineAction | null;
  appliedPriceCents: number | null;
  product: { id: string; name: string; unidadCompra: string; precioCompra: number; taxRatePct: number } | null;
  // What the AI proposes for the bank if this line becomes a new product.
  draft: { name: string; category: ProductCategory | null; mermaPct: number | null; mermaReason: string | null } | null;
  siblings: AmbiguousCandidate[];
  quantityLooksMisread: boolean;
};
export type InvoiceDetail = InvoiceSummary & {
  supplier: { id: string; name: string } | null;
  taxTotalCents: number | null;
  pages: Array<{ position: number; mimeType: string }>;
  lines: InvoiceLineView[];
  checks: {
    totals: { status: "ok" | "mismatch" | "unknown"; sumCents: number | null; diffCents: number | null };
    duplicateOf: string | null;
  };
};

export const invoiceLinePatchSchema = z.object({
  action: z.enum(["update_price", "create_draft", "connect", "ignore"]),
  productId: z.string().min(1).nullable().optional(),
  priceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
});
export type InvoiceLinePatch = z.infer<typeof invoiceLinePatchSchema>;

// The chef's corrections to what was read in the header. The supplier is either one that
// already exists (supplierId) or a typed name (created on first use), never both.
export const invoiceHeaderPatchSchema = z
  .object({
    supplierId: z.string().min(1).max(100).optional(),
    supplierName: z.string().trim().min(1).max(200).optional(),
    number: z.string().trim().max(60).nullable().optional(),
    issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine((b) => b.supplierId === undefined || b.supplierName === undefined, {
    message: "Send supplierId or supplierName, not both",
  });
export type InvoiceHeaderPatch = z.infer<typeof invoiceHeaderPatchSchema>;
