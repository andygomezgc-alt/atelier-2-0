// Fase 3 — Migración retroactiva de pezzatura + re-categorizaciones manuales.
//
// Uso:
//   tsx scripts/migration-pezzatura-fase3.ts             (dry-run; default)
//   tsx scripts/migration-pezzatura-fase3.ts --apply     (escribe a DB)
//
// Cambios que aplica:
//   1. Auto-detección de pezzatura sobre productos cuyo nombre contiene
//      calibre embebido. Por el preview de Fase 2 sabemos que en Dev Kitchen
//      esto es 0 productos, pero el código está por si el banco cambia o
//      se corre en otro restaurant.
//   2. Re-categorizaciones manuales aprobadas por Andy:
//        - "Botarga de mujol"            pescado → seco
//        - "Colatura di Alici de Cetara" pescado → vinagre_aceite
//      Solo se cambia `category`. NO se tocan unidadCompra/merma/criticality
//      para no invalidar el cost ya calculado en recetas que usen estos
//      productos. El chef ajusta esos campos manualmente desde el editor
//      si quiere.
//
// AuditLog: cada cambio genera un entry con action="product_recategorized"
// o action="pezzatura_auto_detected".
import { readFileSync } from "node:fs";
import { join } from "node:path";

(() => {
  const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
})();

import { prisma } from "@atelier/db";
import type { ProductCategory } from "@atelier/db";
import {
  detectPezzaturaFromName,
  formatPezzatura,
  resolvePezzaturaMode,
} from "@atelier/shared";

const RESTAURANT_ID = "cmp1gddcr00ce7k1g8dbybrx9"; // Dev Kitchen
const APPLY = process.argv.includes("--apply");

// Re-categorizaciones aprobadas. Se matchean por nombre exacto (lowercased)
// para no pisar productos similares por error.
const MANUAL_RECATEGORIZATIONS: Array<{
  matchName: string;
  to: ProductCategory;
  reason: string;
}> = [
  {
    matchName: "botarga de mujol",
    to: "seco",
    reason: "Huevas curadas para rallar — no es pescado fresco.",
  },
  {
    matchName: "colatura di alici de cetara",
    to: "vinagre_aceite",
    reason: "Salsa líquida de pescado — categoría líquida.",
  },
];

type ProductRow = {
  id: string;
  name: string;
  category: ProductCategory;
  pezzaturaMode: string | null;
  pezzaturaMin: { toString(): string } | null;
  pezzaturaMax: { toString(): string } | null;
};

type DetectedChange = {
  product: ProductRow;
  pezzatura: { mode: string; min: number; max: number; render: string } | null;
  recategorizeTo: ProductCategory | null;
  recategorizeReason: string | null;
};

async function main() {
  console.log(`\n═══ Fase 3 — Migración retroactiva pezzatura ═══`);
  console.log(`Modo: ${APPLY ? "APPLY (escribe a DB)" : "DRY-RUN (no toca DB)"}`);
  console.log(`Restaurant: Dev Kitchen (${RESTAURANT_ID})\n`);

  const products = await prisma.product.findMany({
    where: { restaurantId: RESTAURANT_ID, deletedAt: null },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      pezzaturaMode: true,
      pezzaturaMin: true,
      pezzaturaMax: true,
    },
  });

  console.log(`Productos en banco: ${products.length}\n`);

  const changes: DetectedChange[] = [];
  let alreadyHasPezzatura = 0;

  for (const p of products) {
    if (p.pezzaturaMode !== null) {
      alreadyHasPezzatura++;
      continue; // no piso valores ya cargados
    }

    const detected = detectPezzaturaFromName(p.name, p.category);
    const reCat = MANUAL_RECATEGORIZATIONS.find(
      (r) => r.matchName === p.name.toLowerCase().trim(),
    );

    if (detected || reCat) {
      changes.push({
        product: p,
        pezzatura: detected
          ? {
              mode: detected.mode,
              min: detected.min,
              max: detected.max,
              render: formatPezzatura(detected),
            }
          : null,
        recategorizeTo: reCat?.to ?? null,
        recategorizeReason: reCat?.reason ?? null,
      });
    }
  }

  // ───────── Reporte ─────────

  console.log(`── Auto-detección de pezzatura ──`);
  const autoDetected = changes.filter((c) => c.pezzatura !== null);
  if (autoDetected.length === 0) {
    console.log(`  0 productos con calibre detectado en el nombre.`);
  } else {
    for (const c of autoDetected) {
      console.log(
        `  ✓ ${c.product.name} → ${c.pezzatura!.mode} (${c.pezzatura!.render})`,
      );
    }
  }

  const modeOnly = products.filter(
    (p) =>
      p.pezzaturaMode === null &&
      resolvePezzaturaMode(p.name, p.category) !== null &&
      !MANUAL_RECATEGORIZATIONS.some(
        (r) => r.matchName === p.name.toLowerCase().trim(),
      ),
  );
  console.log(
    `  ${modeOnly.length} productos con categoría que admite pezzatura pero sin calibre → null (el chef carga manual al usar).`,
  );

  const noMode = products.filter(
    (p) => resolvePezzaturaMode(p.name, p.category) === null,
  );
  console.log(
    `  ${noMode.length} productos con categoría que no admite pezzatura → null permanente.`,
  );

  if (alreadyHasPezzatura > 0) {
    console.log(
      `  ${alreadyHasPezzatura} productos ya tienen pezzatura cargada → NO se tocan.`,
    );
  }
  console.log();

  console.log(`── Re-categorizaciones manuales ──`);
  const reCats = changes.filter((c) => c.recategorizeTo !== null);
  if (reCats.length === 0) {
    console.log(`  Ningún producto coincide con los criterios de re-categorización.`);
    console.log(`  (Esperado: 2 — Botarga de mujol, Colatura di Alici de Cetara.)`);
  } else {
    for (const c of reCats) {
      console.log(
        `  • "${c.product.name}"`,
      );
      console.log(
        `      category:  ${c.product.category} → ${c.recategorizeTo}`,
      );
      console.log(`      razón:     ${c.recategorizeReason}`);
    }
  }
  console.log();

  // ───────── Resumen + ejecución ─────────

  const updateCount = changes.length;
  const auditCount = changes.length;

  console.log(`── Resumen ──`);
  console.log(`  UPDATEs a Product:    ${updateCount}`);
  console.log(`  INSERTs a AuditLog:   ${auditCount}`);
  console.log();

  if (!APPLY) {
    console.log(`Para aplicar:  tsx scripts/migration-pezzatura-fase3.ts --apply`);
    await prisma.$disconnect();
    return;
  }

  if (changes.length === 0) {
    console.log(`Nada para aplicar.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Aplicando…`);
  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      const data: {
        category?: ProductCategory;
        pezzaturaMode?: "pz_per_kg" | "g_per_piece";
        pezzaturaMin?: number;
        pezzaturaMax?: number;
      } = {};
      if (c.recategorizeTo) data.category = c.recategorizeTo;
      if (c.pezzatura) {
        data.pezzaturaMode = c.pezzatura.mode as "pz_per_kg" | "g_per_piece";
        data.pezzaturaMin = c.pezzatura.min;
        data.pezzaturaMax = c.pezzatura.max;
      }

      await tx.product.update({ where: { id: c.product.id }, data });

      const auditPayload: Record<string, unknown> = {
        productId: c.product.id,
        productName: c.product.name,
      };
      let action = "";
      if (c.recategorizeTo && c.pezzatura) {
        action = "product_recategorized_and_pezzatura_detected";
        auditPayload.fromCategory = c.product.category;
        auditPayload.toCategory = c.recategorizeTo;
        auditPayload.reason = c.recategorizeReason;
        auditPayload.pezzatura = c.pezzatura;
      } else if (c.recategorizeTo) {
        action = "product_recategorized";
        auditPayload.fromCategory = c.product.category;
        auditPayload.toCategory = c.recategorizeTo;
        auditPayload.reason = c.recategorizeReason;
      } else if (c.pezzatura) {
        action = "pezzatura_auto_detected";
        auditPayload.pezzatura = c.pezzatura;
      }

      await tx.auditLog.create({
        data: {
          restaurantId: RESTAURANT_ID,
          actorId: null,
          action,
          targetType: "Product",
          targetId: c.product.id,
          payload: auditPayload as never,
        },
      });
    }
  });

  console.log(`✓ Aplicado.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
