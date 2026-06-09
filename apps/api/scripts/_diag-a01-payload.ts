// _diag-a01-payload.ts — Diagnóstico PERMANENTE de A-01 (importar receta del Asistente).
//
// Síntoma: al "Guardar como receta" desde el Asistente, los ingredientes no se
// separan y el título queda como el último mensaje del usuario. Causa: en
// apps/mobile/app/(tabs)/asistente.tsx saveAsRecipe() hace
// parseRecipePayload(lastAssistant.content); si devuelve null cae al fallback.
//
// Hipótesis fuerte (H4): max_tokens=2048 en
// apps/api/app/api/conversations/[id]/messages/route.ts trunca la respuesta —
// el system prompt pide la receta visible completa Y un bloque <recipe_payload>
// JSON al final; con 2048 tokens el bloque del final queda cortado (open sin
// close) → parseRecipePayload null → fallback.
//
// Este script mide sobre datos REALES de la DB:
//  1. de los últimos mensajes del asistente: cuántos tienen el tag abierto /
//     cerrado / parseable, cuántos truncados (open sin close), y cuántos con
//     outputTokens pegados al techo de 2048 (señal directa de truncado).
//  2. recetas ya afectadas con la "firma de fallback" (ingredients vacío +
//     notes + vienen de una conversación) → decide si hace falta migración.
//
// MANTENER EN REPO (pedido de Andy). Si A-01 reaparece tras un cambio, correr
// esto y se diagnostica al instante:  npx tsx apps/api/scripts/_diag-a01-payload.ts
//
// parseRecipePayload: copia FIEL de apps/mobile/src/lib/recipe-payload.ts.
// Mantener en sync (mobile no es package importable desde api).

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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
})();

import { prisma } from "@atelier/db";

// --- Copia fiel de apps/mobile/src/lib/recipe-payload.ts (mantener en sync) ---
const PAYLOAD_OPEN = "<recipe_payload>";
const PAYLOAD_CLOSE = "</recipe_payload>";

function parseRecipePayload(text: string): { title: string } | null {
  const openIdx = text.indexOf(PAYLOAD_OPEN);
  if (openIdx < 0) return null;
  const closeIdx = text.indexOf(PAYLOAD_CLOSE, openIdx + PAYLOAD_OPEN.length);
  if (closeIdx < 0) return null;
  const rawBlock = text
    .substring(openIdx + PAYLOAD_OPEN.length, closeIdx)
    .trim();
  if (!rawBlock) return null;
  const sanitized = rawBlock.replace(/,(\s*[\]}])/g, "$1").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(sanitized);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.title !== "string" || obj.title.length === 0) return null;
  if (!Array.isArray(obj.ingredients)) return null;
  if (!Array.isArray(obj.method)) return null;
  return { title: obj.title };
}
// --- fin copia ---

const MAX_TOKENS = 2048; // techo en conversations/[id]/messages/route.ts

async function main() {
  const msgs = await prisma.message.findMany({
    where: { role: "assistant" },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, content: true, outputTokens: true, createdAt: true },
  });

  let hasOpen = 0;
  let hasClose = 0;
  let parsedOk = 0;
  let truncated = 0;
  let nearCap = 0;
  const truncatedSamples: string[] = [];
  const noOpenSamples: string[] = [];

  for (const m of msgs) {
    const c = m.content ?? "";
    const o = c.includes(PAYLOAD_OPEN);
    const cl = c.includes(PAYLOAD_CLOSE);
    if (o) hasOpen++;
    if (cl) hasClose++;
    if (parseRecipePayload(c)) parsedOk++;
    if (o && !cl) {
      truncated++;
      if (truncatedSamples.length < 3)
        truncatedSamples.push(
          `#${m.id} out=${m.outputTokens ?? "?"} tail=…${c
            .slice(-180)
            .replace(/\n/g, "⏎")}`,
        );
    }
    if ((m.outputTokens ?? 0) >= MAX_TOKENS - 48) nearCap++;
    if (!o && noOpenSamples.length < 3)
      noOpenSamples.push(
        `#${m.id} out=${m.outputTokens ?? "?"} tail=…${c
          .slice(-180)
          .replace(/\n/g, "⏎")}`,
      );
  }

  console.log(`### A-01 — Mensajes del asistente (últimos ${msgs.length})`);
  console.log(`Con <recipe_payload> abierto:        ${hasOpen}`);
  console.log(`Con cierre </recipe_payload>:        ${hasClose}`);
  console.log(`parseRecipePayload OK:               ${parsedOk}`);
  console.log(`Truncados (open sin close):          ${truncated}`);
  console.log(`outputTokens >= ${MAX_TOKENS - 48} (pegado techo): ${nearCap}`);
  console.log();
  if (truncatedSamples.length) {
    console.log("Muestras truncadas:");
    for (const s of truncatedSamples) console.log("  " + s);
    console.log();
  }
  if (noOpenSamples.length) {
    console.log("Muestras SIN open tag:");
    for (const s of noOpenSamples) console.log("  " + s);
    console.log();
  }

  // Impacto: recetas con firma de fallback.
  const recipes = await prisma.recipe.findMany({
    where: { deletedAt: null, sourceConversationId: { not: null } },
    select: { id: true, title: true, contentJson: true, createdAt: true },
  });
  let affected = 0;
  const affectedList: string[] = [];
  for (const r of recipes) {
    const cj = (r.contentJson ?? {}) as {
      ingredients?: unknown;
      notes?: unknown;
    };
    const ingEmpty =
      Array.isArray(cj.ingredients) && cj.ingredients.length === 0;
    const hasNotes =
      typeof cj.notes === "string" && cj.notes.trim().length > 0;
    if (ingEmpty && hasNotes) {
      affected++;
      if (affectedList.length < 25)
        affectedList.push(`  "${r.title}" (${r.id})`);
    }
  }
  console.log(`### Impacto — recetas con firma de fallback`);
  console.log(
    `Vienen de conversación (sourceConversationId): ${recipes.length}`,
  );
  console.log(`Con ingredients vacío + notes (firma A-01):     ${affected}`);
  if (affectedList.length) {
    console.log("Afectadas:");
    for (const a of affectedList) console.log(a);
  }
  console.log();
  console.log(
    affected > 15
      ? ">15 afectadas → proponer migración (badge 'necesita revisión') como mini-plan separado."
      : "<=15 afectadas → Andy las arregla a mano desde el editor (sin migración).",
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
