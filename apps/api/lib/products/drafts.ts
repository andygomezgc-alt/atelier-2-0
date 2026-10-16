// apps/api/lib/products/drafts.ts
// A draft product created from a name the bank does not know (recipe import or invoice line),
// with the kitchen defaults for that name. The chef completes it later in the bank.
import type { Prisma, ProductUnit } from "@atelier/db";
import { detectPezzaturaFromName, type ProductCategory } from "@atelier/shared";
import { categorizeFromName, suggestedMermaPct } from "./defaults";
import { defaultPurchaseUnit } from "./purchase-unit";
import { defaultCriticality } from "./criticality";

export async function createDraftProduct(
  tx: Prisma.TransactionClient,
  input: {
    restaurantId: string; name: string; unidadCompra?: ProductUnit; precioCompra?: number; taxRatePct?: number | null; precioActualizadoAt?: Date;
    // A category and a suggested waste with its reason, when someone (the invoice AI) already estimated them.
    category?: ProductCategory; mermaPct?: number; mermaMotivo?: string;
  },
): Promise<{ id: string; name: string; aliases: string[] }> {
  const { restaurantId, name } = input;
  const category = input.category ?? categorizeFromName(name);
  const pezzatura = detectPezzaturaFromName(name, category);
  return tx.product.create({
    data: {
      restaurantId, name, category, unidadCompra: input.unidadCompra ?? defaultPurchaseUnit(category, name),
      precioCompra: input.precioCompra ?? 0,
      ...(input.taxRatePct != null ? { taxRatePct: input.taxRatePct } : {}),
      ...(input.precioActualizadoAt ? { precioActualizadoAt: input.precioActualizadoAt } : {}),
      mermaPct: input.mermaPct ?? suggestedMermaPct(name, category), mermaOrigen: "sugerida", estado: "borrador",
      ...(input.mermaPct !== undefined && input.mermaMotivo ? { mermaMotivo: input.mermaMotivo } : {}),
      criticality: defaultCriticality(category, name), criticalityManual: false,
      pezzaturaMode: pezzatura?.mode ?? null, pezzaturaMin: pezzatura?.min ?? null, pezzaturaMax: pezzatura?.max ?? null,
    },
    select: { id: true, name: true, aliases: true },
  });
}
